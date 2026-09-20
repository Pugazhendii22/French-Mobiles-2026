import { nextLabelNumber } from './counters';

/**
 * Next label number. Backed by an atomic counter - previously this read the
 * highest existing label and added one, so two staff assigning labels at the
 * same moment both got the same number and two devices ended up sharing a
 * label, which made the scanner open the wrong record.
 */
export const getLabelNumber = async () => nextLabelNumber();

export default getLabelNumber;
