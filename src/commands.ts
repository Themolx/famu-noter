import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NotesTreeProvider, SubjectItem } from './treeProvider';
import { getNotesFolder } from './subjects';
import { createTimelinePanel } from './timeline';

function ensureNotesFolder(): string | undefined {
  const notesDir = getNotesFolder();
  if (!notesDir) {
    vscode.window.showErrorMessage('No workspace folder open. Open a folder first.');
    return undefined;
  }
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
  return notesDir;
}

function todayHeader(): string {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return `${day}. ${month}. ${year}`;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: NotesTreeProvider
) {
  // New Note - pick subject, auto-increment number, create & open
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.newNote', async (item?: SubjectItem) => {
      const notesDir = ensureNotesFolder();
      if (!notesDir) return;

      // Refresh to get latest state
      treeProvider.refresh();
      const subjects = treeProvider.getSubjects();

      let prefix: string;
      let nextNum: number;

      if (item instanceof SubjectItem) {
        // Called from tree context menu on a subject
        prefix = item.subject.prefix;
        nextNum = item.subject.nextNumber;
      } else {
        // Called from command palette - show picker
        const subjectItems = [...subjects.entries()].map(([key, val]) => ({
          label: val.displayName,
          description: `${key} - next: #${val.nextNumber}`,
          prefix: key,
          nextNumber: val.nextNumber,
        }));

        // Add option to create new subject
        subjectItems.push({
          label: '+ New Subject...',
          description: 'Create a new subject',
          prefix: '__new__',
          nextNumber: 1,
        });

        const pick = await vscode.window.showQuickPick(subjectItems, {
          placeHolder: 'Select subject for the new note',
        });

        if (!pick) return;

        if (pick.prefix === '__new__') {
          // Delegate to newSubject command
          await vscode.commands.executeCommand('famuNoter.newSubject');
          return;
        }

        prefix = pick.prefix;
        nextNum = pick.nextNumber;
      }

      const filename = `${prefix}${nextNum}.md`;
      const filePath = path.join(notesDir, filename);

      const header = `# ${prefix.toUpperCase()} - Lecture ${nextNum}\n\n${todayHeader()}\n\n---\n\n`;
      fs.writeFileSync(filePath, header, 'utf-8');

      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      // Place cursor at end
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const lastLine = doc.lineCount - 1;
        const lastChar = doc.lineAt(lastLine).text.length;
        editor.selection = new vscode.Selection(lastLine, lastChar, lastLine, lastChar);
      }

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Created ${filename}`);
    })
  );

  // New Subject
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.newSubject', async () => {
      const notesDir = ensureNotesFolder();
      if (!notesDir) return;

      const prefix = await vscode.window.showInputBox({
        prompt: 'Subject prefix (used in filenames)',
        placeHolder: 'e.g. av, ddf, ai',
        validateInput: (val) => {
          if (!val || !/^[a-zA-Z]+$/.test(val)) {
            return 'Prefix must contain only letters';
          }
          return undefined;
        },
      });

      if (!prefix) return;

      const displayName = await vscode.window.showInputBox({
        prompt: 'Full subject name',
        placeHolder: 'e.g. Audiovize, Dejiny dokumentarniho filmu',
      });

      if (!displayName) return;

      // Save to settings
      const config = vscode.workspace.getConfiguration('famuNoter');
      const existing = config.get<Record<string, string>>('subjects', {});
      existing[prefix.toLowerCase()] = displayName;
      await config.update('subjects', existing, vscode.ConfigurationTarget.Workspace);

      // Create first note
      const filename = `${prefix.toLowerCase()}1.md`;
      const filePath = path.join(notesDir, filename);
      const header = `# ${displayName} - Lecture 1\n\n${todayHeader()}\n\n---\n\n`;
      fs.writeFileSync(filePath, header, 'utf-8');

      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Created subject "${displayName}" (${prefix})`);
    })
  );

  // Open Note - quick pick across all notes
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.openNote', async () => {
      treeProvider.refresh();
      const subjects = treeProvider.getSubjects();

      const items: { label: string; description: string; fullPath: string }[] = [];
      for (const [, subject] of subjects) {
        for (const note of subject.notes) {
          items.push({
            label: note.filename,
            description: subject.displayName,
            fullPath: note.fullPath,
          });
        }
      }

      if (items.length === 0) {
        vscode.window.showInformationMessage('No notes found. Create one first!');
        return;
      }

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Search notes...',
        matchOnDescription: true,
      });

      if (pick) {
        const doc = await vscode.workspace.openTextDocument(pick.fullPath);
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  // Rename Subject
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.renameSubject', async (item?: SubjectItem) => {
      if (!(item instanceof SubjectItem)) return;

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${item.subject.displayName}" to:`,
        value: item.subject.displayName,
      });

      if (!newName || newName === item.subject.displayName) return;

      const config = vscode.workspace.getConfiguration('famuNoter');
      const existing = config.get<Record<string, string>>('subjects', {});
      existing[item.subject.prefix] = newName;
      await config.update('subjects', existing, vscode.ConfigurationTarget.Workspace);

      treeProvider.refresh();
    })
  );

  // Delete Note
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.deleteNote', async (item: any) => {
      if (!item?.note?.fullPath) return;

      const confirm = await vscode.window.showWarningMessage(
        `Delete ${item.note.filename}?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        fs.unlinkSync(item.note.fullPath);
        treeProvider.refresh();
      }
    })
  );

  // Set Notes Folder - folder picker for absolute path
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.setNotesFolder', async () => {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Notes Folder',
        title: 'Choose root folder for FAMU notes',
      });

      if (!result || result.length === 0) return;

      const folderPath = result[0].fsPath;
      const config = vscode.workspace.getConfiguration('famuNoter');
      await config.update('notesFolder', folderPath, vscode.ConfigurationTarget.Global);

      treeProvider.refresh();
      vscode.window.showInformationMessage(`Notes folder set to: ${folderPath}`);
    })
  );

  // Today's Note - quick create/open a note for today's date in a subject
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.todayNote', async () => {
      const notesDir = ensureNotesFolder();
      if (!notesDir) return;

      treeProvider.refresh();
      const subjects = treeProvider.getSubjects();

      const subjectItems = [...subjects.entries()].map(([key, val]) => ({
        label: val.displayName,
        description: key,
        prefix: key,
        nextNumber: val.nextNumber,
      }));

      if (subjectItems.length === 0) {
        vscode.window.showInformationMessage('No subjects found. Create one first!');
        return;
      }

      const pick = await vscode.window.showQuickPick(subjectItems, {
        placeHolder: 'Which subject is today\'s lecture?',
      });

      if (!pick) return;

      // Check if the latest note for this subject was created today
      const subject = subjects.get(pick.prefix);
      if (subject && subject.notes.length > 0) {
        const latestNote = subject.notes[subject.notes.length - 1];
        const stat = fs.statSync(latestNote.fullPath);
        const noteDate = stat.mtime.toDateString();
        const today = new Date().toDateString();

        if (noteDate === today) {
          // Open today's existing note
          const doc = await vscode.workspace.openTextDocument(latestNote.fullPath);
          await vscode.window.showTextDocument(doc);
          return;
        }
      }

      // Create new note
      const nextNum = pick.nextNumber;
      const filename = `${pick.prefix}${nextNum}.md`;
      const filePath = path.join(notesDir, filename);
      const displayName = subjects.get(pick.prefix)?.displayName || pick.prefix.toUpperCase();
      const header = `# ${displayName} - Lecture ${nextNum}\n\n${todayHeader()}\n\n---\n\n`;
      fs.writeFileSync(filePath, header, 'utf-8');

      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const lastLine = doc.lineCount - 1;
        const lastChar = doc.lineAt(lastLine).text.length;
        editor.selection = new vscode.Selection(lastLine, lastChar, lastLine, lastChar);
      }

      treeProvider.refresh();
    })
  );

  // Semester Timeline webview
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.timeline', () => {
      createTimelinePanel(context);
    })
  );

  // Missing Lectures - show quick summary
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.missingLectures', async () => {
      treeProvider.refresh();
      const subjects = treeProvider.getSubjects();

      const lines: string[] = [];
      for (const [, subject] of subjects) {
        if (subject.missingNumbers.length > 0) {
          lines.push(
            `${subject.displayName}: missing #${subject.missingNumbers.join(', #')}`
          );
        }
      }

      if (lines.length === 0) {
        vscode.window.showInformationMessage('No missing lectures detected!');
      } else {
        const msg = lines.join('\n');
        const action = await vscode.window.showWarningMessage(
          `Missing lectures found:\n${msg}`,
          'Show Timeline'
        );
        if (action === 'Show Timeline') {
          createTimelinePanel(context);
        }
      }
    })
  );

  // Search Notes - full-text search across all notes
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.searchNotes', async () => {
      const notesDir = getNotesFolder();
      if (!notesDir) {
        vscode.window.showErrorMessage('No notes folder configured.');
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Search notes content',
        placeHolder: 'e.g. emergentni, alpha go, fenomenologie',
      });

      if (!query) return;

      // Use VS Code's built-in search
      await vscode.commands.executeCommand('workbench.action.findInFiles', {
        query,
        filesToInclude: notesDir,
        triggerSearch: true,
        isRegex: false,
        isCaseSensitive: false,
      });
    })
  );
}
