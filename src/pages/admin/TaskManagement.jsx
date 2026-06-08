import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/common/Layout';
import { checkAndResetTasks } from '../../utils/taskResetLogic';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';

const TaskManagement = () => {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState('All Tasks');
  const [filterStaff, setFilterStaff] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    frequency: 'daily',
    priority: 'medium',
    dueDate: ''
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await checkAndResetTasks();

      const tasksRef = collection(db, 'tasks');
      const q = query(tasksRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const tasksList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTasks(tasksList);

      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      const staffList = usersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.role === 'staff' && u.isActive !== false);
      setStaff(staffList);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateResetDate = (dueDateStr, frequency) => {
    const dueDate = new Date(dueDateStr);
    if (frequency === 'one-time') return dueDate;

    const d = new Date(dueDate);
    if (frequency === 'daily') {
      d.setDate(d.getDate() + 1);
    } else if (frequency === 'weekly') {
      d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
    } else if (frequency === 'monthly') {
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
    }
    return d;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.assignedTo || !formData.dueDate) return;

    const assignedStaff = staff.find(s => s.id === formData.assignedTo);
    const dueDate = new Date(formData.dueDate);
    const resetDate = calculateResetDate(formData.dueDate, formData.frequency);

    const taskData = {
      title: formData.title,
      description: formData.description,
      assignedTo: formData.assignedTo,
      assignedToName: assignedStaff ? assignedStaff.name || assignedStaff.email : '',
      frequency: formData.frequency,
      priority: formData.priority,
      dueDate: Timestamp.fromDate(dueDate),
      status: 'pending',
      resetDate: Timestamp.fromDate(resetDate)
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdBy: currentUser.uid,
          createdAt: Timestamp.fromDate(new Date())
        });
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving task: ", error);
    }
  };

  const handleDelete = async (id) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'tasks', deleteTarget.id));
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setDeleting(false);
    }
  };

  const openModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      const tzOffset = (new Date()).getTimezoneOffset() * 60000;
      const localISOTime = (new Date(task.dueDate.toDate() - tzOffset)).toISOString().slice(0, 16);
      setFormData({
        title: task.title,
        description: task.description || '',
        assignedTo: task.assignedTo,
        frequency: task.frequency,
        priority: task.priority,
        dueDate: localISOTime
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: '',
        description: '',
        assignedTo: '',
        frequency: 'daily',
        priority: 'medium',
        dueDate: ''
      });
    }
    setIsModalOpen(true);
  };

  const filteredTasks = tasks.filter(task => {
    if (filterTab !== 'All Tasks' && task.frequency.toLowerCase() !== filterTab.toLowerCase()) return false;
    if (filterStaff !== 'All' && task.assignedTo !== filterStaff) return false;
    if (filterStatus !== 'All' && task.status !== filterStatus.toLowerCase()) return false;
    return true;
  });

  const getPriorityColor = (priority) => {
    if (priority === 'high') return 'bg-red-100 text-red-800 border-red-200';
    if (priority === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };


  useEffect(() => {
    if (isModalOpen || deleteTarget) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isModalOpen, deleteTarget]);
  return (
    <Layout title="Task Management" pageType="list">
      <div className="flex-1 min-w-0">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]">Task Management</h1>
            <p className="text-sm text-[#64748b] mt-1">Manage staff tasks and routines.</p>
          </div>
          <button
            onClick={() => openModal()}
            className="bg-[#002395] hover:bg-[#001a7a] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 break-words"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            Add New Task
          </button>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#e2e8f0] mb-6 break-words">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex overflow-x-auto pb-2 md:pb-0 hide-scrollbar w-full md:w-auto gap-2">
              {['All Tasks', 'Daily', 'Weekly', 'Monthly', 'One-time'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${filterTab === tab ? 'bg-[#002395] text-white' : 'text-[#64748b] hover:bg-blue-50'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <select
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
                className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-xl block w-full p-2.5 outline-none transition-colors font-medium break-words"
              >
                <option value="All">All Staff</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.email}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-xl block w-full p-2.5 outline-none transition-colors font-medium break-words"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden break-words">
          {loading ? (
            <div className="p-8 text-center text-[#64748b] font-medium">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-[#64748b] font-medium">No tasks found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTasks.map(task => (
                <div key={task.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors break-words">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#0f172a] text-sm truncate">{task.title}</p>
                    {task.description && <p className="text-xs text-[#64748b] mt-1 truncate">{task.description}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-[#64748b] md:grid-cols-4 md:gap-4 md:text-right">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#002395]">Assigned</div>
                      <div className="text-[#0f172a] font-medium">{task.assignedToName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#002395]">Frequency</div>
                      <div className="capitalize text-[#0f172a] font-medium">{task.frequency}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[#002395]">Due</div>
                      <div className="text-[#0f172a] font-medium">{task.dueDate?.toDate().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 md:mt-0 md:justify-end">
                    <button onClick={() => openModal(task)} className="text-[#002395] hover:bg-blue-50 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors">Edit</button>
                    <button onClick={() => setDeleteTarget(task)} className="text-[#ED2939] hover:bg-red-50 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto flex items-start justify-center p-4">
            <div className="relative bg-white rounded-2xl w-full max-w-md mx-auto my-8 shadow-2xl border border-[#e2e8f0]">
              <div className="flex items-center justify-between px-6 py-4 bg-[#002395] rounded-t-2xl">
                <h3 className="text-lg font-bold text-white">{editingTask ? 'Edit Task' : 'Add New Task'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-white hover:text-blue-200 p-1 rounded transition">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 overflow-visible flex-1">
                <form id="taskForm" onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block mb-1 text-sm font-bold text-[#0f172a]">Title <span className="text-[#ED2939]">*</span></label>
                    <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words" />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-bold text-[#0f172a]">Description</label>
                    <textarea rows="3" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words"></textarea>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-bold text-[#0f172a]">Assign To <span className="text-[#ED2939]">*</span></label>
                    <select required value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words">
                      <option value="">Select Staff</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>{s.name || s.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1 text-sm font-bold text-[#0f172a]">Frequency <span className="text-[#ED2939]">*</span></label>
                      <select required value={formData.frequency} onChange={e => setFormData({ ...formData, frequency: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="one-time">One-time</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 text-sm font-bold text-[#0f172a]">Priority <span className="text-[#ED2939]">*</span></label>
                      <select required value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words">
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-bold text-[#0f172a]">Due Date & Time <span className="text-[#ED2939]">*</span></label>
                    <input type="datetime-local" required value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} className="border-2 border-[#e2e8f0] focus:border-[#002395] text-[#0f172a] text-sm rounded-lg block w-full p-2.5 outline-none transition-colors font-medium break-words" />
                  </div>
                </form>
              </div>
              <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end gap-3 rounded-b-2xl break-words">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white border-2 border-[#e2e8f0] text-[#64748b] rounded-xl px-6 py-2.5 font-bold hover:bg-gray-50 transition break-words">Cancel</button>
                <button type="submit" form="taskForm" className="bg-[#002395] text-white rounded-xl px-6 py-2.5 font-bold hover:bg-[#001a7a] transition break-words">Save Task</button>
              </div>
            </div>
          </div>
        )}
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
          title="Delete Task"
          message="Are you sure you want to delete this task? This action cannot be undone."
        />
      </div>
    </Layout>
  );
};

export default TaskManagement;
