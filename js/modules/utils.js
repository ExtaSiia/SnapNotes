/* ---------- Utilities & Helpers ---------- */

export function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function formatContent(text) {
    if (!text) return '';
    let safe = escapeHtml(text);

    // Link detection
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    safe = safe.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // Markdown - Bold
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    // Markdown - Code
    safe = safe.replace(/`(.*?)`/g, '<code>$1</code>');
    // Markdown - Lists
    safe = safe.replace(/^- (.*)/gm, '<li>$1</li>');
    safe = safe.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Clean up: Remove newlines around list items (to avoid <br> between them)
    // and replace other newlines with <br>
    // Handle CRLF or LF
    safe = safe.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove newlines *inside* or *around* UL to prevent stray <br>
    safe = safe.replace(/<\/li>\n<li>/g, '</li><li>');
    safe = safe.replace(/<\/ul>\n/g, '</ul>');
    safe = safe.replace(/\n<ul>/g, '<ul>');

    // Replace remaining newlines with <br>
    safe = safe.replace(/\n/g, '<br>');

    return safe;
}

export function copyToClipboard(text, onSuccess, onError) {
    navigator.clipboard.writeText(text).then(() => {
        if (onSuccess) onSuccess();
    }).catch(err => {
        console.error('Copy failed', err);
        if (onError) onError(err);
    });
}
