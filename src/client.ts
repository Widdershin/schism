import {makeAnimationDriver} from 'cycle-animation-driver';
import {div, pre, input, button, makeDOMDriver} from '@cycle/dom';
import {run} from '@cycle/xstream-run';

import xs from 'xstream';

function view (state) {
  return (
    div('.chat-app', [
      input('.new-message'),
      button('.send', 'Send'),

      div('.messages', state.messages.map(message => div('.message', message)))
    ])
  );
}

function Client (sources) {
  const state$ = sources.Socket.messages.startWith({messages: []});

  const newMessage$ = sources.DOM
    .select('.new-message')
    .events('input')
    .map(ev => ev.target.value);

  const send$ = sources.DOM
    .select('.send')
    .events('click');

  const message$ = newMessage$
    .map(message => send$.mapTo(message))
    .flatten();

  return {
    DOM: state$.map(view),
    Socket: message$
  }
}

function makeWebSocketDriver (ws) {
  return function socketDriver (sink$, streamAdapter) {
    const {observer, stream} = streamAdapter.makeSubject();
    const startup = xs.create();


    ws.onmessage = (data, flags) => {
      observer.next(JSON.parse(data.data));
    };

    ws.onopen = () => {
      sink$.addListener({
        next (message) {
          console.log('outgoing message', message);
          ws.send(message);
        }
      });

      startup.shamefullySendNext('');
    };

    return {
      messages: stream,
      startup
    };
  }
}

const drivers = {
  DOM: makeDOMDriver('.app'),
  Time: makeAnimationDriver(),
  Socket: makeWebSocketDriver(new WebSocket(`ws://127.0.0.1:8000/websocket`))
};

run(Client, drivers);

