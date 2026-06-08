const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.jsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('src/pages').concat(walk('src/components'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // PART 3 & 7: Replace fixed heights and overflow-hidden on common containers
  // Match classNames that look like container cards
  content = content.replace(/className="([^"]*(?:bg-white|rounded|shadow)[^"]*)"/g, (match, classes) => {
    let newClasses = classes;
    newClasses = newClasses.replace(/\bh-screen\b/g, 'min-h-screen');
    newClasses = newClasses.replace(/\bh-(?:64|96|[0-9]+px)\b/g, 'min-h-[auto]'); 
    newClasses = newClasses.replace(/\boverflow-hidden\b/g, 'overflow-visible');
    // Add break-words
    if (!newClasses.includes('break-words') && !newClasses.includes('break-all')) {
        newClasses += ' break-words';
    }
    return `className="${newClasses}"`;
  });

  // PART 4: Tables
  content = content.replace(/<table\b[^>]*className="([^"]*)"/g, (match, classes) => {
    let newClasses = classes.replace(/\b(?:min-w-full|w-full)\b/g, '').trim();
    newClasses += ' w-full min-w-max';
    return match.replace(classes, newClasses.trim());
  });
  
  // Wrap unwrapped tables (simple heuristic)
  // We'll rely on the global CSS for table overflow-x:auto we already added, 
  // but let's make sure there's no fixed width blocking it.

  // PART 5: Forms & Modals
  // Look for fixed inset-0 modals
  content = content.replace(/className="fixed inset-0 z-10 overflow-y-auto"/g, 'className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"');
  
  // Modal boxes usually have 'inline-block align-bottom bg-white rounded-lg ...'
  content = content.replace(/className="[^"]*inline-block align-bottom bg-white rounded-lg[^"]*"/g, (match) => {
    let classes = match;
    classes = classes.replace(/align-bottom|inline-block/g, '');
    classes = classes.replace(/overflow-hidden/g, 'overflow-y-auto');
    if (!classes.includes('max-h-screen')) {
       classes = classes.slice(0, -1) + ' max-h-screen w-full max-w-lg"';
    }
    return classes;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
});
