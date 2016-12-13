import {makeAnimationDriver} from 'cycle-animation-driver';
import {h, div, pre, input, button, makeDOMDriver} from '@cycle/dom';
import {run} from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';

import {Game, Action, GameState, PlayerState} from './game';
import {add} from './vector';

function mousePosition (event) {
  return {
    x: event.clientX,
    y: event.clientY
  }
}

function renderPlayer (player: PlayerState) {
  const size = 64;
  return (
    h('g', [
      h('image', {
        attrs: {
          href: '/character.png',
          x: player.position.x - size / 2,
          y: player.position.y - size / 2,
          width: size,
          height: size
        }
      }),

      h('text', {
        attrs: {
          x: player.position.x,
          y: player.position.y + size,
          'text-anchor': 'middle',
        }
      }, player.name.slice(0, 5)),

      h('text', {
        class: {
          speech: true
        },

        attrs: {
          'font-size': 'larger',
          filter: 'url(#solid)',
          x: player.position.x,
          y: player.position.y - size * 0.75,
          'text-anchor': 'middle'
        }
      }, player.newMessage),

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
    ])
  ])
)

function view (state: GameState) {
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
      ...Object.values(state.players).map(renderPlayer)
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

