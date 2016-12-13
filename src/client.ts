import {makeAnimationDriver} from 'cycle-animation-driver';
import {h, div, pre, input, button, makeDOMDriver} from '@cycle/dom';
import {run} from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';

import {Game, Action, GameState, PlayerState} from './game';
import {add, subtract} from './vector';

function mousePosition (event) {
  return {
    x: event.clientX,
    y: event.clientY
  }
}

const MESSAGE_DISPLAY_TIME = 10000;
const MESSAGE_FADEOUT_TIME = 8500;

function messageOpacity (timeAgo: number): number {
  if (timeAgo < MESSAGE_FADEOUT_TIME) {
    return 1;
  }

  return 1 - (timeAgo - MESSAGE_FADEOUT_TIME) / (MESSAGE_DISPLAY_TIME - MESSAGE_FADEOUT_TIME);
}

function isMovingLeft (player: PlayerState): boolean {
  return player.destination && subtract(player.destination, player.position).x < 0
}

function renderPlayer (player: PlayerState, time: number) {
  const size = 64;
  let speechToDisplay = player.chat.slice(0, 5);

  speechToDisplay = speechToDisplay.filter(message => time - message.time < MESSAGE_DISPLAY_TIME);

  let transform = `scale(1, 1)`;

  if (isMovingLeft(player)) {
    transform = `translate(${player.position.x * 2}, 0), scale(-1, 1)`;
  }

  if (player.destination) {
    transform += ` rotate(${Math.sin(time / 50) * 10 % 360} ${player.position.x} ${player.position.y})`;
  }

  if (player.newMessage !== '') {
    const newMessage = {
      id: 'newMessage',
      time,
      text: player.newMessage
    }

    speechToDisplay = [newMessage].concat(speechToDisplay);
  }

  return (
    h('g', {attrs: {x: player.position.x, y: player.position.y}}, [
      h('ellipse', {
        class: {
          shadow: true
        },

        attrs: {
          cx: player.position.x,
          cy: player.position.y + size / 2 - 3,

          rx: size / 3,
          ry: size / 5,
          fill: 'url(#fadeOut)',
          opacity: 0.7
        }
      }),

      h('image', {
        attrs: {
          href: '/character.png',
          x: player.position.x - size / 2,
          y: player.position.y - size / 2,
          width: size,
          height: size,
          transform
        }
      }),

      h('text', {
        attrs: {
          x: player.position.x,
          y: player.position.y + size,
          'text-anchor': 'middle',
        }
      }, player.name.slice(0, 5)),

      ...speechToDisplay.map((message, index) =>
        h('text', {
          class: {
            speech: true
          },

          attrs: {
            'font-size': 'larger',
            filter: 'url(#solid)',
            x: player.position.x,
            y: player.position.y - size * 0.75 - index * 30,
            opacity: messageOpacity(time - message.time),
            'text-anchor': 'middle'
          }
        }, message.text)
      ),

      h('polygon', {
        class: {
          invisible: player.newMessage === ''
        },
        attrs: {
          points: [
            add(player.position, {x: -5, y: -45}),
            add(player.position, {x: 5, y: -45}),
            add(player.position, {x: 0, y: -35})
          ].map(({x, y}) => `${x},${y}`).join(' '),

          fill: 'white'
        }
      })
    ])
  )
}

const defs = (
  h('defs', [
    h('filter', {
      attrs: {
        id: 'solid',
        x: -0.05,
        y: -0.05,
        width: 1.1,
        height: 1.1
      }
    }, [
      h('feFlood', {attrs: {'flood-color': 'beige'}}),
      h('feComposite', {attrs: {in: 'SourceGraphic'}})
    ]),

    h('radialGradient', {
      attrs: {
        id: 'fadeOut',
        fx: 0.5,
        fy: 0.5,
        r: 1
      }
    }, [
      h('stop',  {
        attrs: {
          'stop-opacity': 1,
          offset: 0
        }
      }),

      h('stop',  {
        attrs: {
          'stop-opacity': 0,
          offset: 0.6
        }
      }),
    ])
  ])
)

function view (state: GameState) {
  const time = new Date().getTime();
  return (
    h('svg', {
      attrs: {
        width: '100vw',
        height: '100vh',
        xmlns: "http://www.w3.org/2000/svg",
        'xmlns:xlink': 'http://www.w3.org/1999/xlink'
      }
    }, [
      defs,
      ...Object.values(state.players).map(player => renderPlayer(player, time))
    ])
  );
}

function Client (sources) {
  const stateUpdate$ = sources.Socket.messages
    .filter(message => message.type === 'UPDATE_STATE')
    .map(message => message.data);

  const stateOverride$ = stateUpdate$
    .map(serverState => ({type: 'OVERRIDE', data: serverState}));

  const id$ = sources.Socket.messages
    .filter(message => message.type === 'SET_ID')
    .map(message => message.data)
    .remember();

  const move$ = sources.DOM
    .select('svg')
    .events('click')
    .map(mousePosition)
    .map(destination => ({type: 'MOVE', data: destination}));

  const chat$ = sources.DOM
    .select('document')
    .events('keydown')
    .map(event => ({type: 'CHAT', data: event.key}));

  const gameAction$ = xs.merge(
    move$,
    stateOverride$,
    chat$
  );

  const gameActionWithId$ = id$
    .map(id => gameAction$.map(action => ({...action, id})))
    .flatten();

  const state$ = Game({
    Animation: sources.Animation,
    action$: gameActionWithId$ as Stream<Action>
  });

  const socket$ = xs.merge(
    move$,
    chat$
  );

  return {
    DOM: state$.map(view),
    Socket: socket$
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
          ws.send(JSON.stringify(message));
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
  Animation: makeAnimationDriver(),
  Socket: makeWebSocketDriver(new WebSocket(`ws://127.0.0.1:8000/websocket`))
};

run(Client, drivers);

