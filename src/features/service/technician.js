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

/**
 * The names to offer in the box: shop staff first, then the outside technicians
 * the shop has typed before and had remembered.
 *
 * Deduplicated case-insensitively, because the two lists come from different
 * places and nothing stops a name being in both - someone typed before they were
 * given a login, say. Staff win, so the spelling on the staff record is the one
 * shown.
 */
export const technicianOptions = (staffOptions = [], remembered = []) => {
  const names = [];
  const seen = new Set();
  const add = (name) => {
    const clean = String(name ?? '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    names.push(clean);
  };
  (staffOptions || []).forEach(st => add(staffNameOf(st)));
  (remembered || []).forEach(add);
  return names;
};

/**
 * The name worth remembering from a saved order, or null.
 *
 * Only a technician from outside: staff names already come from the users
 * collection, and filing them here would show them twice in the box and leave a
 * copy behind when somebody leaves.
 */
export const technicianToRemember = (typed, staffOptions = []) => {
  const clean = String(typed ?? '').trim();
  if (!clean || matchStaffByName(staffOptions, clean)) return null;
  return clean;
};

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

/**
 * Who the technician box starts on, before anyone chooses.
 *
 * An admin starts on nobody. It used to start on the signed-in account's name,
 * which for a shop signed in as itself is the shop's own name - so every order
 * went in reading "French Mobiles" as the technician, and the job card printed
 * it. Blank asks the question instead of answering it wrongly.
 *
 * A member of staff is the technician: they took the device in, the order is
 * theirs, and they cannot assign it to anybody else.
 *
 * An order that already names someone keeps them, whoever is opening it.
 */
export const defaultTechnicianName = ({ isAdmin = false, ownName = '', existing = '' } = {}) => {
  const already = String(existing ?? '').trim();
  if (already) return String(existing);
  return isAdmin ? '' : String(ownName ?? '');
};
