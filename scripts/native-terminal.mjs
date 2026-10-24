import { spawn, spawnSync } from 'node:child_process';
export function launchNativeTerminal(script, cwd, args = []) {
  const quotePS = text => "'" + text.replaceAll("'", "''") + "'";
  if (process.platform === 'win32') {
    const argumentsString = [script, ...args].map(value => '"' + value.replaceAll('"','') + '"').join(' ');
    const command = `Start-Process -FilePath ${quotePS(process.execPath)} -ArgumentList ${quotePS(argumentsString)} -WorkingDirectory ${quotePS(cwd)} -PassThru | Select-Object -ExpandProperty Id`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8' });
    return r.status === 0 && /^\d+\s*$/.test(r.stdout || '');
  }
  if (process.platform === 'darwin') {
    const shellQuote = text => "'" + text.replaceAll("'", "'\\''") + "'";
    const command = [process.execPath, script, ...args].map(shellQuote).join(' ');
    const r = spawnSync('osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(command)}`, '-e', 'tell application "Terminal" to activate'], { encoding: 'utf8' });
    return r.status === 0;
  }
  for (const [app, prefix] of [['x-terminal-emulator', ['-e']], ['gnome-terminal', ['--']], ['konsole', ['-e']], ['xterm', ['-e']]]) {
    if (spawnSync('which', [app], { encoding: 'utf8' }).status !== 0) continue;
    const child = spawn(app, [...prefix, process.execPath, script, ...args], { detached: true, stdio: 'ignore', cwd });
    child.on('error', () => {}); child.unref();
    return true; // Receipt remains the authority; an app launch is not readiness.
  }
  return false;
}
