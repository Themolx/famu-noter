import * as vscode from 'vscode';
import * as fs from 'fs';
import { SubjectInfo, getNotesFolder, scanNotesDirectory } from './subjects';

export function createTimelinePanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'famuTimeline',
    'FAMU Semester Timeline',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  updateTimeline(panel);
  return panel;
}

function updateTimeline(panel: vscode.WebviewPanel) {
  const notesDir = getNotesFolder();
  if (!notesDir) {
    panel.webview.html = '<h2>No notes folder configured</h2>';
    return;
  }

  const subjects = scanNotesDirectory(notesDir);

  // Build data: for each note, get file modification time
  const subjectData: {
    prefix: string;
    name: string;
    notes: { num: number; filename: string; date: string; timestamp: number }[];
    missing: number[];
  }[] = [];

  for (const [, subject] of subjects) {
    const numbered = subject.notes.filter((n) => n.number > 0);
    if (numbered.length === 0) continue;

    const notes = numbered.map((n) => {
      let timestamp = 0;
      let date = '';
      try {
        const stat = fs.statSync(n.fullPath);
        timestamp = stat.mtime.getTime();
        date = stat.mtime.toLocaleDateString('cs-CZ');
      } catch {}
      return { num: n.number, filename: n.filename, date, timestamp };
    });

    subjectData.push({
      prefix: subject.prefix,
      name: subject.displayName,
      notes,
      missing: subject.missingNumbers,
    });
  }

  // Sort subjects by most notes first
  subjectData.sort((a, b) => b.notes.length - a.notes.length);

  const colors = [
    '#E8D635', '#4A90D9', '#9B59B6', '#E67E22', '#2ECC71',
    '#E74C3C', '#1ABC9C', '#8B7355', '#95A5A6', '#F39C12',
  ];

  panel.webview.html = getTimelineHtml(subjectData, colors);
}

function getTimelineHtml(
  subjectData: {
    prefix: string;
    name: string;
    notes: { num: number; filename: string; date: string; timestamp: number }[];
    missing: number[];
  }[],
  colors: string[]
): string {
  const totalNotes = subjectData.reduce((sum, s) => sum + s.notes.length, 0);
  const totalMissing = subjectData.reduce((sum, s) => sum + s.missing.length, 0);

  const subjectRows = subjectData
    .map((s, i) => {
      const color = colors[i % colors.length];
      const maxNum = Math.max(...s.notes.map((n) => n.num), ...s.missing, 0);
      const cells: string[] = [];

      for (let n = 1; n <= maxNum; n++) {
        const note = s.notes.find((x) => x.num === n);
        if (note) {
          cells.push(
            `<div class="cell done" style="background:${color}" title="${note.filename}\n${note.date}">${n}</div>`
          );
        } else {
          cells.push(
            `<div class="cell missing" title="${s.prefix}${n}.md - MISSING">${n}</div>`
          );
        }
      }

      return `
        <div class="subject-row">
          <div class="subject-label" style="border-left: 4px solid ${color}">
            <strong>${s.name}</strong>
            <span class="prefix">${s.prefix}</span>
            ${s.missing.length > 0 ? `<span class="warn">${s.missing.length} missing</span>` : ''}
          </div>
          <div class="cells">${cells.join('')}</div>
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 20px;
    margin: 0;
  }
  h1 { font-size: 1.4em; margin-bottom: 4px; }
  .stats { opacity: 0.6; margin-bottom: 24px; font-size: 0.9em; }
  .subject-row { margin-bottom: 16px; }
  .subject-label {
    padding: 4px 8px;
    margin-bottom: 6px;
    font-size: 0.9em;
  }
  .subject-label .prefix { opacity: 0.5; margin-left: 8px; }
  .subject-label .warn {
    color: #E8D635;
    margin-left: 8px;
    font-size: 0.85em;
  }
  .cells { display: flex; gap: 4px; flex-wrap: wrap; }
  .cell {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75em; font-weight: 600;
    border-radius: 4px;
    cursor: default;
  }
  .cell.done { color: #000; opacity: 0.9; }
  .cell.done:hover { opacity: 1; transform: scale(1.1); }
  .cell.missing {
    border: 2px dashed var(--vscode-editorWarning-foreground, #E8D635);
    opacity: 0.5;
    color: var(--vscode-editorWarning-foreground, #E8D635);
  }
</style>
</head>
<body>
  <h1>FAMU Semester Timeline</h1>
  <div class="stats">${totalNotes} notes across ${subjectData.length} subjects${totalMissing > 0 ? ` | ${totalMissing} missing lectures` : ''}</div>
  ${subjectRows}
</body>
</html>`;
}
