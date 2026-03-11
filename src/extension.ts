import * as vscode from 'vscode';
import { NotesTreeProvider } from './treeProvider';
import { registerCommands } from './commands';
import { setupGitBackup } from './gitBackup';

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new NotesTreeProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('famuNoterSubjects', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register all commands
  registerCommands(context, treeProvider);

  // Setup git auto-backup
  setupGitBackup(context);

  // Initial scan
  treeProvider.refresh();

  // Watch for file changes in the notes folder
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  watcher.onDidChange(() => treeProvider.refresh());
  context.subscriptions.push(watcher);

  // Also refresh when config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('famuNoter')) {
        treeProvider.refresh();
      }
    })
  );

  console.log('FAMU Noter activated');
}

export function deactivate() {}
