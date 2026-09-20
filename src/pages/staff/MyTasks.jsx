import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';
import { checkAndResetTasks } from '../../utils/taskResetLogic';

const MyTasks = () => {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filterTab, setFilterTab] = useState('All'); // All | Daily | Weekly | Monthly | Pending | Completed

  const fetchTasks = useCallback(async () => {
    if (!currentUser) return;
    try {
      await checkAndResetTasks();
      
      const tasksRef = collection(db, 'tasks');
      const q = query(
        tasksRef, 
        where('assignedTo', '==', currentUser.uid)
      );
      
      const snapshot = await getDocs(q);
      const tasksList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Firestore composite index might be needed if we combine where and orderBy, so we sort client side.
      tasksList.sort((a, b) => b.createdAt?.toDate() - a.createdAt?.toDate());
      
      setTasks(tasksList);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchTasks(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAsDone = async (id) => {
    try {
      await updateDoc(doc(db, 'tasks', id), {
        status: 'completed',
        completedAt: Timestamp.fromDate(new Date()),
        completedBy: currentUser.uid
      });
      fetchTasks();
    } catch (error) {
      console.error('Error marking task as done:', error);
    }
  };

  const isOverdue = (targetDate) => {
    const date = targetDate instanceof Date ? targetDate : (targetDate?.toDate ? targetDate.toDate() : new Date(targetDate));
    return date.getTime() < new Date().getTime();
  };

  const filteredTasks = tasks.filter(task => {
    if (filterTab === 'All') return true;
    if (filterTab === 'Pending') return task.status === 'pending';
    if (filterTab === 'Completed') return task.status === 'completed';
    return task.frequency.toLowerCase() === filterTab.toLowerCase();
  });

  return (
  <Layout title="My Tasks" pageType="list">
    {/* FILTER TABS */}
    <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto scrollbar-hide">
      {['All', 'Daily', 'Weekly', 'Monthly', 'Pending', 'Completed'].map(tab => (
        <button
          key={tab}
          onClick={() => setFilterTab(tab)}
          className={`flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition ${
            filterTab === tab
              ? 'bg-[#002395] text-white'
              : 'bg-white border border-gray-200 text-gray-500'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>

    {/* TASK CARDS */}
    <div className="px-4 pt-2 space-y-3">
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-tasks text-4xl text-gray-200 mb-3 block"></i>
          <p className="text-gray-400 text-sm">No tasks found</p>
        </div>
      ) : (
        filteredTasks.map(task => (
          <div
            key={task.id}
            className={`bg-white rounded-2xl border-l-4 shadow-sm p-4 ${
              task.status === 'completed' ? 'border-green-500 opacity-75' :
              task.priority === 'high' ? 'border-[#ED2939]' :
              task.priority === 'medium' ? 'border-orange-500' :
              'border-[#002395]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-semibold text-sm ${
                    task.status === 'completed'
                      ? 'line-through text-gray-400'
                      : 'text-[#0f172a]'
                  }`}>
                    {task.title}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    task.priority === 'high' ? 'bg-red-100 text-red-800' :
                    task.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {task.priority}
                  </span>
                  <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                    {task.frequency}
                  </span>
                </div>
                {task.description && (
                  <p className="text-gray-400 text-xs mt-1">{task.description}</p>
                )}
                <p className={`text-xs mt-2 font-medium ${
                  isOverdue(task.dueDate) && task.status === 'pending'
                    ? 'text-[#ED2939]'
                    : 'text-gray-400'
                }`}>
                  <i className="fas fa-clock mr-1"></i>
                  Due: {task.dueDate?.toDate?.()?.toLocaleDateString('en-IN')}
                  {isOverdue(task.dueDate) && task.status === 'pending' && (
                    <span className="ml-1 bg-[#ED2939] text-white text-xs px-1.5 py-0.5 rounded-full">
                      Overdue
                    </span>
                  )}
                </p>
              </div>
              <div className="flex-shrink-0">
                {task.status === 'pending' ? (
                  <button
                    onClick={() => handleMarkAsDone(task.id)}
                    className="bg-[#002395] text-white px-3 py-2 rounded-xl text-xs font-semibold"
                  >
                    Done ✓
                  </button>
                ) : (
                  <span className="bg-green-100 text-green-700 px-3 py-2 rounded-xl text-xs font-semibold">
                    Completed ✓
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </Layout>
  );
};

export default MyTasks;
