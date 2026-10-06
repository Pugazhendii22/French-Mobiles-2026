/* ─────────────────────────────────────────────
   WHO IS WORKING ON IT

   The technician box used to be a closed list of staff with a login, which left
   two ordinary situations with nowhere to go: work sent to a repair shop down the
   road - something the intake form already prices, under Outside labour - and a
   technician who has since left and dropped off the active-staff list.

   So it takes a typed name too. That raises a question the closed list never had
   to answer: an order carries technicianUid as well as technicianName, and the
   uid is what decides who can see and change the order. It is the staff filter on
   the service list, and it is read by canEditOrder, canComplete and
   canChangeStatus on the order page.

   Blanking it for a name from outside the shop would quietly drop the order out
   of every technician's list and leave only an admin able to touch it. So the two
   fields answer two different questions:

     technicianName   who is doing the work, whoever that is
     technicianUid    who in the shop answers for the order

   A name picked from the list sets both to that person. A name from outside sets
   the name only, and the order stays with whoever already had it.
────────────────────────────────────────────── */

/** What a staff record is called on screen. */
export const staffNameOf = (staff) => staff?.name || staff?.email || '';

/** The staff member that name belongs to, or null when it is somebody else. */
export const matchStaffByName = (staffOptions = [], typed) => {
  const needle = String(typed ?? '').trim().toLowerCase();
  if (!needle) return null;
  return (staffOptions || []).find(st => staffNameOf(st).trim().toLowerCase() === needle) || null;
};

/** The names to offer in the box. */
export const technicianOptions = (staffOptions = []) =>
  (staffOptions || []).map(staffNameOf).filter(Boolean);

/**
 * What the two technician fields become when the box reads `typed`.
 *
 * `previousUid` is what the order already carried, and `fallbackUid` is the
 * person filling the form in - used only when the order has nobody yet.
 */
export const technicianFor = ({ typed, staffOptions = [], previousUid = '', fallbackUid = '' }) => {
  const match = matchStaffByName(staffOptions, typed);
  if (match) {
    return { technicianName: staffNameOf(match), technicianUid: match.uid, isOutside: false };
  }
  const name = String(typed ?? '');
  return {
    technicianName: name,
    technicianUid: previousUid || fallbackUid || '',
    isOutside: Boolean(name.trim()),
  };
};
