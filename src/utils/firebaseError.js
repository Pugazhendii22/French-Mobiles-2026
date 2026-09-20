/* Firebase error messages are written for developers. These are the three that
   actually stop a shop working, in words the person at the counter can act on. */
export const describeFirebaseError = (err) => {
  const code = err?.code || '';
  const msg = String(err?.message || '');

  if (code === 'resource-exhausted' || /quota/i.test(msg)) {
    return "The database has hit today's free usage limit. It resets automatically after midnight (US Pacific time). To keep working now, upgrade the Firebase plan in the console.";
  }
  if (code === 'permission-denied') {
    return 'Permission denied by the database. Check your Firestore security rules, then try again.';
  }
  if (code === 'unavailable' || /offline|network/i.test(msg)) {
    return 'No connection to the database. Check your internet and try again.';
  }
  return msg || 'Something went wrong. Please try again.';
};

export default describeFirebaseError;
