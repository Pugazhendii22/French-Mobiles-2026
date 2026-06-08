import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const checkAndResetTasks = async () => {
  try {
    const now = new Date();
    
    // We only query recurring tasks to check if they need reset
    const tasksRef = collection(db, 'tasks');
    const q = query(
      tasksRef, 
      where('frequency', 'in', ['daily', 'weekly', 'monthly'])
    );
    
    const snapshot = await getDocs(q);
    
    const updatePromises = snapshot.docs.map(async (taskDoc) => {
      const data = taskDoc.data();
      const currentResetDate = data.resetDate?.toDate();
      
      // If no reset date or it's still in the future, skip
      if (!currentResetDate || currentResetDate >= now) {
        return Promise.resolve();
      }

      let nextResetDate = new Date(currentResetDate);
      
      // Catch up the date to future
      while (nextResetDate <= now) {
        if (data.frequency === 'daily') nextResetDate.setDate(nextResetDate.getDate() + 1);
        else if (data.frequency === 'weekly') nextResetDate.setDate(nextResetDate.getDate() + 7);
        else if (data.frequency === 'monthly') nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      }

      return updateDoc(doc(db, 'tasks', taskDoc.id), {
        status: 'pending',
        completedAt: null,
        resetDate: nextResetDate
      });
    });
    
    await Promise.all(updatePromises);
  } catch (error) {
    console.error("Error resetting tasks:", error);
  }
};
