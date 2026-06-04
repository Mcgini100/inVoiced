const http = require('http');

http.get('http://localhost:3000', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (data.includes('min-h-screen')) {
      console.log('SUCCESS: HTML includes min-h-screen class usage!');
    } else {
      console.log('FAILURE: No min-h-screen usage found.');
    }
    
    // In dev mode, Next.js injects styles. Check if the definition for min-h-screen exists.
    if (data.includes('min-height: 100vh') || data.includes('min-height:100vh')) {
      console.log('SUCCESS: CSS definition for min-h-screen found!');
    } else {
      console.log('FAILURE: CSS definition for min-h-screen NOT found in HTML.');
    }
    
    // Also try to check if there are any style tags at all
    const styles = data.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styles) {
      console.log(`Found ${styles.length} style tags.`);
      let found = false;
      for (const style of styles) {
        if (style.includes('min-height') && style.includes('100vh')) {
          found = true;
          break;
        }
      }
      if (found) console.log('Tailwind utility class styles are present in the style tags!');
      else console.log('Tailwind utility class styles are missing from style tags.');
    } else {
      console.log('No style tags found.');
    }
  });
}).on('error', (err) => {
  console.log('Error fetching:', err.message);
});
