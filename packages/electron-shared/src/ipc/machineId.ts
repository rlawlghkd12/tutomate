import { type IpcMain } from 'electron';
import nodeMachineId from 'node-machine-id';
const { machineIdSync } = nodeMachineId;
import log from 'electron-log/main';

export function registerMachineIdHandler(ipcMain: IpcMain) {
  ipcMain.handle('get-machine-id', async () => {
    try {
      const id = machineIdSync(true);
      log.info('Machine ID retrieved successfully');
      return id;
    } catch (error) {
      log.error('Failed to get machine ID:', error);
      throw new Error('Failed to get machine ID');
    }
  });
}
