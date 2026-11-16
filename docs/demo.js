import { apply, empty } from './client.mjs';

const el = id => document.getElementById(id);
const words = 'The browser went offline. Meanwhile, the server kept the rest of the answer.'.match(/\S+\s*/g);
let events, state, connected, interruptAtFive;

function setConnection(value) {
  connected = value;
  el('toggle').textContent = connected ? 'Disconnect' : 'Reconnect';
  el('status').textContent = (connected ? 'Connected' : 'Disconnected') + ' · resume cursor ' + state.cursor;
}

function replay() {
  for (const event of events.slice(state.cursor)) {
    if (!connected) return;
    if (event.seq === 5 && interruptAtFive) {
      interruptAtFive = false;
      if (el('mode').value === 'skip') state = { ...state, cursor: event.seq };
      setConnection(false);
      return;
    }
    state = apply(state, event);
    el('answer').textContent = state.text;
    el('status').textContent = state.status + ' · resume cursor ' + state.cursor;
    if (event.kind === 'done') {
      el('mode').disabled = false;
      el('race').disabled = el('mode').value === 'skip';
      el('start').disabled = false;
      el('toggle').disabled = true;
    }
  }
}

el('toggle').onclick = () => {
  setConnection(!connected);
  if (connected) replay();
};

el('mode').onchange = () => {
  const missingWord = el('mode').value === 'skip';
  if (missingWord) el('race').checked = true;
  el('race').disabled = missingWord;
};

el('start').onclick = () => {
  interruptAtFive = el('race').checked;
  el('mode').disabled = true;
  el('race').disabled = true;
  events = [];
  state = empty();
  el('answer').textContent = '';
  el('log').textContent = '';
  el('start').disabled = true;
  el('toggle').disabled = false;
  setConnection(true);
  const timer = setInterval(() => {
    const index = events.length;
    const event = { seq: index + 1, kind: index < words.length ? 'chunk' : 'done', text: words[index] || '' };
    events.push(event);
    el('log').textContent += event.seq + '  ' + event.kind + '  ' + event.text + '\n';
    if (event.kind === 'done') clearInterval(timer);
    replay();
  }, 800);
};
