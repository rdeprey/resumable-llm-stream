export const empty = () => ({ text: '', cursor: 0, status: 'streaming' });

export function apply(state, event) {
  if (event.seq <= state.cursor) return state;
  if (event.seq !== state.cursor + 1) throw new Error('Missing event before ' + event.seq);
  return {
    text: state.text + (event.kind === 'chunk' ? event.text : ''),
    cursor: event.seq,
    status: event.kind === 'chunk' ? 'streaming' : event.kind
  };
}

export async function observe(base, id, state, signal, receive) {
  if (state.status !== 'streaming') return;
  const response = await fetch(base + '/events?id=' + id + '&after=' + state.cursor, { signal });
  if (!response.ok) throw new Error('Stream request failed: ' + response.status);
  let pending = '';
  for await (const part of response.body.pipeThrough(new TextDecoderStream())) {
    pending += part;
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const event = JSON.parse(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      signal.throwIfAborted();
      receive(event);
      if (event.kind !== 'chunk' || signal.aborted) return;
    }
  }
  throw new Error('Connection ended early');
}
