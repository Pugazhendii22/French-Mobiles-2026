import { describe, it, expect } from 'vitest';
import { parseImeiReply } from '@/features/imeiVerification/parseReply';

const VALID_REPLY = `IMEI: 353994102005045
MarketingName: Apple iPhone 11 (A2221)
Brand: Apple
Model: iPhone 11 (A2221)
Manufacturer: Apple Inc
DeviceType: Smartphone
-Department of Telecom`;

const BLACKLISTED_REPLY = `IMEI: 359750560742238
Status: IMEI is blacklisted
-Department of Telecom`;

describe('parseImeiReply', () => {
  describe('known device replies', () => {
    it('reads the echoed IMEI and the full device block', () => {
      const result = parseImeiReply(VALID_REPLY);
      expect(result.status).toBe('valid');
      expect(result.imei).toBe('353994102005045');
      expect(result.device).toEqual({
        marketingName: 'Apple iPhone 11 (A2221)',
        brand: 'Apple',
        model: 'iPhone 11 (A2221)',
        manufacturer: 'Apple Inc',
        deviceType: 'Smartphone',
      });
    });

    it('still parses when 14422 uses extra whitespace around colons', () => {
      const noisy = VALID_REPLY.replace(/: /g, ':   ');
      const result = parseImeiReply(noisy);
      expect(result.status).toBe('valid');
      expect(result.device.brand).toBe('Apple');
    });

    it('does not require marketingName / manufacturer / deviceType to be present', () => {
      // Future-proofing: a shorter future reply with just Brand+Model is still useful.
      const trimmed = `IMEI: 353994102005045\nBrand: Xiaomi\nModel: Redmi Note 11\n-Department of Telecom`;
      const result = parseImeiReply(trimmed);
      expect(result.status).toBe('valid');
      expect(result.device.brand).toBe('Xiaomi');
      expect(result.device.model).toBe('Redmi Note 11');
      expect(result.device.marketingName).toBeUndefined();
    });
  });

  describe('blacklisted replies', () => {
    it('flags the IMEI as blacklisted', () => {
      const result = parseImeiReply(BLACKLISTED_REPLY);
      expect(result.status).toBe('blacklisted');
      expect(result.imei).toBe('359750560742238');
    });

    it('still matches when 14422 phrases blacklist slightly differently', () => {
      const variant = `IMEI: 359750560742238\nStatus: This IMEI has been blacklisted\n-Department of Telecom`;
      expect(parseImeiReply(variant).status).toBe('blacklisted');
    });
  });

  describe('daily KYM quota replies', () => {
    // Verbatim from a real 14422 reply after two lookups in one day. Note the
    // missing space after "Status:" - that is how the service actually sends it.
    const RATE_LIMITED_REPLY = `IMEI: 860427057038493
Status:KYM limit reached Try tomorrow
-Department of Telecom`;

    it('is reported as rate_limited, not as a verdict on the IMEI', () => {
      const result = parseImeiReply(RATE_LIMITED_REPLY);
      expect(result.status).toBe('rate_limited');
      expect(result.imei).toBe('860427057038493');
    });

    it('is never mistaken for a valid device or a blacklisting', () => {
      const result = parseImeiReply(RATE_LIMITED_REPLY);
      expect(result.status).not.toBe('valid');
      expect(result.status).not.toBe('blacklisted');
      expect(result.device).toBeUndefined();
    });

    it('matches the "try tomorrow" wording on its own', () => {
      const variant = `IMEI: 860427057038493\nStatus: Please try tomorrow\n-Department of Telecom`;
      expect(parseImeiReply(variant).status).toBe('rate_limited');
    });
  });

  describe('replies that do not match either known shape', () => {
    it('returns unrecognized rather than guessing', () => {
      const unknown = `Sorry, your request could not be processed. -DoT`;
      const result = parseImeiReply(unknown);
      expect(result.status).toBe('unrecognized');
      expect(result.raw).toBe(unknown);
    });

    it('keeps the echoed IMEI on unrecognized replies if one is present', () => {
      // So the webhook can still match the record even when the body is unexpected.
      const partial = `IMEI: 353994102005045\nSomething else entirely`;
      const result = parseImeiReply(partial);
      expect(result.status).toBe('unrecognized');
      expect(result.imei).toBe('353994102005045');
    });

    it('handles empty and nullish input without throwing', () => {
      expect(parseImeiReply('').status).toBe('unrecognized');
      expect(parseImeiReply(null).status).toBe('unrecognized');
      expect(parseImeiReply(undefined).status).toBe('unrecognized');
    });
  });
});
