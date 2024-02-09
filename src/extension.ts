'use strict';

import * as vscode from 'vscode';
import { O_HC3fslog } from './utils';
import { HC3 } from './hc3';
import { HC3FS } from './fileSystemProvider';

let inited = false;

let fdec: vscode.Disposable | undefined;

function log(msg: string) {
	O_HC3fslog.info(msg);
	console.log(msg);
}

export function activate(context: vscode.ExtensionContext) {
	
	log('hc3fs says "Hello"');
	
	const conf = vscode.workspace.getConfiguration('hc3fs');
	let hc3: HC3;

	if (!inited) {
		const hc3Fs = new HC3FS();
		context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hc3fs', hc3Fs, { isCaseSensitive: true }));
		hc3 = new HC3(conf);
		hc3Fs.setHC3(hc3);
		hc3.api.getInfo().then((data) => {
			log("HC3 version: " + data.softVersion);
			vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS - ${conf.url}` });
			let decClass = new FileDecorationProvider(true, true, "X", hc3);   // fileDecorator Class
			O_HC3fslog.info('activation done');
			inited = true;
		}).catch((err) => {
			vscode.window.showErrorMessage(err);
		});
	}

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.workspaceInit', _ => {
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS` });
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
}

export function deactivate() {
	log('hc3fs says "Goodbye"');
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
		if (!uri.path.endsWith(".lua")) {
			return;
		}
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

