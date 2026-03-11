import * as vscode from 'vscode';
import { SubjectInfo, NoteInfo, scanNotesDirectory, getNotesFolder } from './subjects';

export type TreeItem = SubjectItem | NoteItem;

export class SubjectItem extends vscode.TreeItem {
  constructor(public readonly subject: SubjectInfo) {
    super(subject.displayName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'subject';
    this.description = `${subject.prefix} (${subject.notes.length})`;
    this.iconPath = new vscode.ThemeIcon('book');
  }
}

export class NoteItem extends vscode.TreeItem {
  constructor(public readonly note: NoteInfo) {
    super(note.filename, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'note';
    this.description = note.number > 0 ? `#${note.number}` : '';
    this.iconPath = new vscode.ThemeIcon('file');
    this.command = {
      command: 'vscode.open',
      title: 'Open Note',
      arguments: [vscode.Uri.file(note.fullPath)],
    };
    this.resourceUri = vscode.Uri.file(note.fullPath);
  }
}

export class NotesTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private subjects: Map<string, SubjectInfo> = new Map();

  refresh(): void {
    const notesDir = getNotesFolder();
    if (notesDir) {
      this.subjects = scanNotesDirectory(notesDir);
    } else {
      this.subjects = new Map();
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getSubjects(): Map<string, SubjectInfo> {
    return this.subjects;
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // Root level - show subjects sorted alphabetically
      const items: SubjectItem[] = [];
      const sorted = [...this.subjects.entries()].sort((a, b) =>
        a[1].displayName.localeCompare(b[1].displayName)
      );
      for (const [, subject] of sorted) {
        items.push(new SubjectItem(subject));
      }
      return items;
    }

    if (element instanceof SubjectItem) {
      return element.subject.notes.map((note) => new NoteItem(note));
    }

    return [];
  }
}
