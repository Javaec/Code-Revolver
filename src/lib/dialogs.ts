import { confirm, message } from '@tauri-apps/plugin-dialog';
import { toErrorMessage } from './errors';

export async function showError(error: unknown, title = 'Code Revolver'): Promise<void> {
  await message(toErrorMessage(error), { title });
}

export async function showInfo(text: string, title = 'Code Revolver'): Promise<void> {
  await message(text, { title });
}

export async function confirmAction(text: string, title = 'Confirm'): Promise<boolean> {
  return await confirm(text, { title });
}
