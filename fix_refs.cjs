const fs = require('fs');

const filesToUpdate = [
  'src/pages/customers/CustomerList.jsx',
  'src/pages/admin/StaffManagement.jsx',
  'src/pages/inventory/SecondHandList.jsx',
  'src/pages/service/ServiceOrderList.jsx',
  'src/pages/sales/SalesList.jsx',
  'src/components/sales/NewSaleModal.jsx',
  'src/pages/products/ProductList.jsx',
  'src/pages/admin/LabelRegistryList.jsx',
  'src/pages/admin/TaskManagement.jsx'
];

filesToUpdate.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // We injected a bad useEffect. Let's find it.
  const badEffectRegex = /useEffect\(\(\) => \{\s*if \((.*?)\) \{\s*document\.body\.style\.overflow = "hidden";\s*\} else \{\s*document\.body\.style\.overflow = "unset";\s*\}\s*return \(\) => \{ document\.body\.style\.overflow = "unset"; \};\s*\}, \[(.*?)\]\);/gs;

  content = content.replace(badEffectRegex, (match, condition, deps) => {
    const declaredVars = [];
    
    // Find all const [varName] = useState
    const useStateRegex = /const \[([a-zA-Z0-9_]+),\s*set[a-zA-Z0-9_]+\]\s*=\s*useState/g;
    let m;
    while ((m = useStateRegex.exec(content)) !== null) {
      declaredVars.push(m[1]);
    }
    
    // Find props (simple heuristic)
    const propsRegex = /(?:const|function) [a-zA-Z0-9_]+\s*=\s*\(\{\s*([^}]+)\s*\}\)/g;
    let mProps;
    if ((mProps = propsRegex.exec(content)) !== null) {
      const propsList = mProps[1].split(',').map(s => s.trim().split('=')[0].trim());
      declaredVars.push(...propsList);
    }

    // Determine which ones are valid for this file
    const potential = ['showModal', 'isModalOpen', 'completeModalOpen', 'billModalOpen', 'showRatingModal', 'showConfirm', 'showStaffModal', 'show', 'isOpen', 'deleteTarget'];
    
    const valid = potential.filter(v => declaredVars.includes(v));
    
    if (valid.length === 0) {
      return ''; // remove if no valid state
    }
    
    return `useEffect(() => {
    if (${valid.join(' || ')}) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [${valid.join(', ')}]);`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
});
