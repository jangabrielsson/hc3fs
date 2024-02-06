'use strict';

import * as vscode from 'vscode';

import { HC3FS } from './fileSystemProvider';
import { HC3 } from './hc3';

let inited = false;
let O_HC3Console: vscode.LogOutputChannel;
let O_HC3Events: vscode.LogOutputChannel;
let O_HC3fslog: vscode.LogOutputChannel;

export const printHC3ConsoleChannel = (time: string, typ:string, tag:string, message:string): void => {
	if (typ==='debug') {
		O_HC3Console.debug(`[${tag}] ${message}`);
	} else if (typ==='warning') {
		O_HC3Console.warn(`[${tag}] ${message}`);
	} else if (typ==='trace') {
		O_HC3Console.trace(`[${tag}] ${message}`);
	} else if (typ==='error') {
		O_HC3Console.error(`[${tag}] ${message}`);
	}
};

export const printHC3EventsChannel = (content: string, reveal = false): void => {
	O_HC3Events.debug(content);
	if (reveal) {
		O_HC3Events.show(true);
	}
};

export const printHC3fslogChannel = (content: string, reveal = false): void => {
	O_HC3fslog.debug(content);
	if (reveal) {
		O_HC3fslog.show(true);
	}
};

let fdec: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
	O_HC3Console = vscode.window.createOutputChannel("HC3 console",{log: true});
	O_HC3Events = vscode.window.createOutputChannel("HC3 events",{log: true});
	O_HC3fslog = vscode.window.createOutputChannel("HC3 fslog",{log: true});
	
	O_HC3fslog.info('hc3fs says "Hello"');
	let conf = vscode.workspace.getConfiguration('files');
	conf.update('autoSave', 'off');
	
	conf = vscode.workspace.getConfiguration('hc3fs');
	let hc3: HC3;

	if (!inited) {
		const hc3Fs = new HC3FS();
		context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hc3fs', hc3Fs, { isCaseSensitive: true }));
		hc3 = new HC3(conf);
		hc3Fs.setHC3(hc3);
		hc3.callHC3("GET", "/settings/info/").then((data) => {
			O_HC3fslog.info("HC3 version: " + data.softVersion);
			vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS - ${conf.url}` });
			let decClass = new FileDecorationProvider(true, true, "X", hc3);   // fileDecorator Class
			inited = true;
		}).catch((err) => {
			vscode.window.showErrorMessage(err);
		});
	}

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.workspaceInit', _ => {
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS - ${conf.url}` });
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.toggleLog', _ => {
		if (!inited) {
			return;
		}
		hc3.toggleLog();
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.logFilter', _ => {
		if (!inited) {
			return;
		}
		hc3.logFilterPicker();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.downloadFQA', spec => {
		if (!inited) {
			return;
		}
		hc3.downloadFQA(spec);
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.downloadScene', spec => {
		if (!inited) {
			return;
		}
		hc3.downloadScene(spec);
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.resync', spec => {
		if (!inited) {
			return;
		}
		if (spec.path === '/QuickApps') {
			hc3.resyncQA();
		} else if (spec.path === '/Scenes') {
			hc3.resyncScenes();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.toggleReadOnly', spec => {
		if (!inited) {
			return;
		}
		hc3.toggleReadOnly(spec);
	}));
}

export function deactivate() {
	O_HC3fslog.info('hc3fs says "Goodbye"');
	fdec?.dispose();
}

class FileDecorationProvider {    
	disposables: vscode.Disposable[];   
	colorEnabled: boolean;
	color?: vscode.ThemeColor;
	badgeEnabled: boolean;
	newBadge?: string; 
	hc3: HC3;

  constructor(colorEnabled: boolean, badgeEnabled: boolean, newBadge: string, hc3: HC3) {
		this.hc3 = hc3;
    this.disposables = [];
    this.disposables.push(vscode.window.registerFileDecorationProvider(this));
    
    this.colorEnabled = colorEnabled;
    this.colorEnabled ? this.color = new vscode.ThemeColor("highlightFiles.nonWorkspaceFiles") : this.color = undefined;
    
    this.badgeEnabled = badgeEnabled;
    this.badgeEnabled ? this.newBadge = newBadge : this.newBadge = undefined;
    if (this.badgeEnabled) { this.newBadge = this.newBadge || '!'; }
  }
  
  async provideFileDecoration(uri: vscode.Uri) {
		const path = uri.path;
    if (!(uri.scheme === 'hc3fs' && path.endsWith(".lua"))) {
			return;
		}
		const file = await this.hc3.lookup(uri.path,true);
    return {
      //badge: this.newBadge,
      badge: "\u21C7",  // ⛖
      color: new vscode.ThemeColor("highlightFiles.workspaceFolder1"),
      propagate: true,
      tooltip: "Workspace TestMultiRoot"
    };
  }
    
    // if ((isFile.type === 1) && (result < 0))    // is a file, not a directory && not in workspace
    //   return {
    //     badge: this.newBadge,
    //     // badge: "\u26D6",  // ⛖
    //     color: this.color,
    //     tooltip: "File not in workspace"
    //   };
    // }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}

