/* ─────────────────────────────────────────────
   IMAGE DELIVERY
   Photos are uploaded to Cloudinary at up to 1280px / ~500KB. Rendering that
   full file inside a 64px thumbnail wastes most of the download, so ask
   Cloudinary for a variant sized to the box it will actually occupy.

   f_auto  - serve WebP/AVIF when the browser supports it
   q_auto  - let Cloudinary pick the quality that still looks clean
   c_limit - only ever shrink, never upscale a small original
────────────────────────────────────────────── */

const UPLOAD_SEGMENT = '/image/upload/';

const withTransform = (url, transform) => {
  if (!url || typeof url !== 'string') return url;
  // Non-Cloudinary sources (Firebase Storage, data URIs, local assets) pass through
  if (!url.includes(UPLOAD_SEGMENT)) return url;
  return url.replace(UPLOAD_SEGMENT, `${UPLOAD_SEGMENT}${transform}/`);
};

/**
 * Sized variant for an image rendered in a known-size box.
 * `width` is the CSS width; it is doubled so the image stays sharp on
 * 2x/3x phone screens.
 */
export const imageThumb = (url, width) =>
  withTransform(url, `f_auto,q_auto,c_limit,w_${Math.round(width * 2)}`);

/**
 * Full-size image with format and quality optimisation but no resizing.
 * For the full-screen viewer, where the user wants detail.
 */
export const imageFull = (url) => withTransform(url, 'f_auto,q_auto');

export default imageThumb;
