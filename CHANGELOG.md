## Release Notes

### 0.0.1

Initial release of hc3fs
* QuickApps and Scenes are "mounted"
* QuickApps support editing/adding/deleting/renaming files
* Scenes only support viewing of files

* Changes in QuickApp files are synched to the HC3 but changes on the HC3 is not synched back yet to vscode (being implemented)
* HC3 Web UI may need to be reloaded if the QA is open to see the changes.

### 0.0.2

- Logs written to LogOutputChannels
  - Output: 'HC3 Console' console logs from the HC3
  - Output: 'HC3 Events' events from HC3 (refreshState)
  - Output: 'HC3 hc3fs' logs from the hc3fs extension

Command Palette commands
- 'hc3fs: Setup Workspace' 
  - Mounts the HC3 filesystem
- 'hc3fs: Filter HC3 logs on tags' 
  - Shows pick list for tags that should be shown in the 'HC3 Console' output channel

File explorer context commands
- 'hc3: Download .fqa'
  - Only when QuickApp (folder)
- 'hc3: Download Scene'
  - Only when Scene (folder)
- 'hc3: Toggle read only for file'
  - Only QuickApp .lua files  
