import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface NoteInfo {
  prefix: string;
  number: number;
  suffix: string; // e.g. "seminar", "OLED", "_class"
  filename: string;
  fullPath: string;
}

export interface SubjectInfo {
  prefix: string;
  displayName: string;
  notes: NoteInfo[];
  nextNumber: number;
}

// Known FAMU subject mappings - user can override via settings
const DEFAULT_SUBJECTS: Record<string, string> = {
  av: 'Audiovize',
  ai: 'AI & Emergence',
  ddf: 'Dejiny dok. filmu',
  pf: 'Postprodukce filmu',
  droga: 'Droga & Film',
  avseminar: 'AV Seminar',
  sound: 'Sound Design',
  kompozice: 'Kompozice',
  zanryvPChrach: 'Zanry v praci',
};

/**
 * Parse a markdown filename into its subject prefix and number.
 * Handles patterns like: av1.md, ddf_class3.md, avseminar2.md, avOLED.md
 */
export function parseNoteFilename(filename: string): NoteInfo | null {
  if (!filename.endsWith('.md')) return null;

  const name = filename.replace('.md', '');

  // Try to match: prefix + optional suffix + number
  // e.g. "av12", "ddf_class3", "avseminar5"
  const match = name.match(/^([a-zA-Z]+?)(\d+)$/);
  if (match) {
    return {
      prefix: match[1].toLowerCase(),
      number: parseInt(match[2], 10),
      suffix: '',
      filename,
      fullPath: '',
    };
  }

  // Match with underscore suffix: ddf_class3
  const matchSuffix = name.match(/^([a-zA-Z]+?)_([a-zA-Z]+)(\d+)$/);
  if (matchSuffix) {
    return {
      prefix: matchSuffix[1].toLowerCase(),
      number: parseInt(matchSuffix[3], 10),
      suffix: '_' + matchSuffix[2],
      filename,
      fullPath: '',
    };
  }

  // Match prefix-only files (no number): avOLED.md, poznamky.md, sound.md
  const prefixOnly = name.match(/^([a-zA-Z]+)$/);
  if (prefixOnly) {
    // Check if it matches a known prefix pattern
    const lower = name.toLowerCase();
    for (const known of Object.keys(DEFAULT_SUBJECTS)) {
      if (lower.startsWith(known) && lower.length > known.length) {
        return {
          prefix: known,
          number: 0,
          suffix: name.substring(known.length),
          filename,
          fullPath: '',
        };
      }
    }
    // Standalone file - treat the whole name as prefix
    return {
      prefix: lower,
      number: 0,
      suffix: '',
      filename,
      fullPath: '',
    };
  }

  return null;
}

/**
 * Scan a directory for markdown files and group them by subject.
 */
export function scanNotesDirectory(notesDir: string): Map<string, SubjectInfo> {
  const subjects = new Map<string, SubjectInfo>();

  if (!fs.existsSync(notesDir)) {
    return subjects;
  }

  const files = fs.readdirSync(notesDir);
  const config = vscode.workspace.getConfiguration('famuNoter');
  const userSubjects = config.get<Record<string, string>>('subjects', {});
  const allSubjectNames = { ...DEFAULT_SUBJECTS, ...userSubjects };

  for (const file of files) {
    const fullPath = path.join(notesDir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && file.endsWith('.md')) {
      const info = parseNoteFilename(file);
      if (info) {
        info.fullPath = fullPath;

        if (!subjects.has(info.prefix)) {
          subjects.set(info.prefix, {
            prefix: info.prefix,
            displayName: allSubjectNames[info.prefix] || info.prefix.toUpperCase(),
            notes: [],
            nextNumber: 1,
          });
        }

        const subject = subjects.get(info.prefix)!;
        subject.notes.push(info);
        if (info.number >= subject.nextNumber) {
          subject.nextNumber = info.number + 1;
        }
      }
    }

    // Also scan subdirectories (like semester2/)
    if (stat.isDirectory() && !file.startsWith('.')) {
      const subFiles = fs.readdirSync(fullPath);
      for (const subFile of subFiles) {
        const subFullPath = path.join(fullPath, subFile);
        const subStat = fs.statSync(subFullPath);
        if (subStat.isFile() && subFile.endsWith('.md')) {
          const info = parseNoteFilename(subFile);
          if (info) {
            info.fullPath = subFullPath;

            if (!subjects.has(info.prefix)) {
              subjects.set(info.prefix, {
                prefix: info.prefix,
                displayName: allSubjectNames[info.prefix] || info.prefix.toUpperCase(),
                notes: [],
                nextNumber: 1,
              });
            }

            const subject = subjects.get(info.prefix)!;
            subject.notes.push(info);
            if (info.number >= subject.nextNumber) {
              subject.nextNumber = info.number + 1;
            }
          }
        }
      }
    }
  }

  // Sort notes within each subject by number
  for (const subject of subjects.values()) {
    subject.notes.sort((a, b) => a.number - b.number);
  }

  return subjects;
}

export function getNotesFolder(): string | undefined {
  const config = vscode.workspace.getConfiguration('famuNoter');
  const notesFolder = config.get<string>('notesFolder', '');

  // Absolute path - use directly (works without a workspace open)
  if (notesFolder && path.isAbsolute(notesFolder)) {
    return notesFolder;
  }

  // Relative path - resolve against workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    if (notesFolder) {
      // User set a relative path but no workspace is open
      vscode.window.showWarningMessage(
        'FAMU Noter: Set an absolute path in famuNoter.notesFolder, or open a workspace.'
      );
    }
    return undefined;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  if (!notesFolder || notesFolder === '.') {
    return rootPath;
  }

  return path.join(rootPath, notesFolder);
}
