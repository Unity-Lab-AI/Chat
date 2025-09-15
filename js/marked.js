export const marked = {
  parse(markdown = '') {
    const lines = markdown.split('\n');
    let html = '';
    let inCode = false;
    let codeLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('```')) {
        if (inCode) {
          html += `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
          inCode = false;
          codeLines = [];
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }
      if (line.trim() === '---') {
        html += '<hr>';
      } else if (line.trim()) {
        html += `<p>${escapeHtml(line.trim())}</p>`;
      }
    }
    if (inCode) {
      html += `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
    }
    return html;
  }
};

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}

