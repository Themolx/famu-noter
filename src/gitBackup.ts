import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { getNotesFolder } from './subjects';

let backupTimeout: ReturnType<typeof setTimeout> | undefined;
let statusBarItem: vscode.StatusBarItem;

export function setupGitBackup(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.command = 'famuNoter.gitBackupNow';
  context.subscriptions.push(statusBarItem);

  updateStatusBar('idle');

  // Debounced auto-backup: commit 30s after last save
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
  const scheduleBackup = () => {
    if (backupTimeout) clearTimeout(backupTimeout);
    updateStatusBar('pending');
    backupTimeout = setTimeout(() => runBackup(), 30000);
  };

  watcher.onDidChange(scheduleBackup);
  watcher.onDidCreate(scheduleBackup);
  watcher.onDidDelete(scheduleBackup);
  context.subscriptions.push(watcher);

  // Manual backup command
  context.subscriptions.push(
    vscode.commands.registerCommand('famuNoter.gitBackupNow', () => {
      if (backupTimeout) clearTimeout(backupTimeout);
      runBackup();
    })
  );
}

function updateStatusBar(state: 'idle' | 'pending' | 'syncing' | 'done' | 'error' | 'no-git') {
  switch (state) {
    case 'idle':
      statusBarItem.text = '$(notebook) FAMU';
      statusBarItem.tooltip = 'FAMU Noter - click to backup notes';
      break;
    case 'pending':
      statusBarItem.text = '$(notebook) FAMU *';
      statusBarItem.tooltip = 'Unsaved changes - auto-backup in 30s (click to backup now)';
      break;
    case 'syncing':
      statusBarItem.text = '$(sync~spin) FAMU';
      statusBarItem.tooltip = 'Backing up notes...';
      break;
    case 'done':
      statusBarItem.text = '$(check) FAMU';
      statusBarItem.tooltip = 'Notes backed up';
      setTimeout(() => updateStatusBar('idle'), 3000);
      break;
    case 'error':
      statusBarItem.text = '$(error) FAMU';
      statusBarItem.tooltip = 'Backup failed - click to retry';
      break;
    case 'no-git':
      statusBarItem.text = '$(notebook) FAMU';
      statusBarItem.tooltip = 'No git repo in notes folder - click to initialize';
      break;
  }
  statusBarItem.show();
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

async function runBackup() {
  const notesDir = getNotesFolder();
  if (!notesDir) return;

  updateStatusBar('syncing');

  try {
    // Check if it's a git repo
    try {
      await git(['rev-parse', '--git-dir'], notesDir);
    } catch {
      // Not a git repo - initialize
      await git(['init'], notesDir);
      await git(['checkout', '-b', 'main'], notesDir);
    }

    // Check for changes
    const status = await git(['status', '--porcelain'], notesDir);
    if (!status) {
      updateStatusBar('done');
      return;
    }

    // Stage all markdown files
    await git(['add', '*.md'], notesDir);
    // Also add in subdirectories
    await git(['add', '**/*.md'], notesDir);

    const now = new Date();
    const msg = `notes ${now.toLocaleDateString('cs-CZ')} ${now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;
    await git(['commit', '-m', msg], notesDir);

    // Push if remote exists
    try {
      await git(['remote', 'get-url', 'origin'], notesDir);
      await git(['push'], notesDir);
    } catch {
      // No remote configured - that's fine, local backup only
    }

    updateStatusBar('done');
  } catch (err: any) {
    console.error('FAMU Noter backup error:', err.message);
    // If "nothing to commit" that's fine
    if (err.message?.includes('nothing to commit')) {
      updateStatusBar('done');
    } else {
      updateStatusBar('error');
    }
  }
}
