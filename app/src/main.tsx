import { render } from 'preact';
import { App } from './App';
import { openAppDb, requestPersistence } from './storage/db';
import { UpdatePrompt } from './ui/UpdatePrompt';
import './styles.css';

void openAppDb().then((db) => {
  void requestPersistence(navigator);
  render(<App db={db} UpdatePrompt={UpdatePrompt} />, document.getElementById('app') as HTMLElement);
});
