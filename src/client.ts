import {makeAnimationDriver} from 'cycle-animation-driver';
import {h, div, pre, input, button, makeDOMDriver} from '@cycle/dom';
import {run} from '@cycle/xstream-run';

import xs, {Stream} from 'xstream';

import {Game, Action, GameState, PlayerState, EnemyState, EnemyTarget} from './game';
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

function isMovingLeft (player: PlayerState | EnemyState): boolean {
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

  if (player.mode === 'MOVING') {
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

  const jumpY = jumpHeight(player.attackProgress, player.attackLength);
  const jumpHeightTotal = 30;
  const jumpRatio = jumpY / jumpHeightTotal;
  const additionalShadowFade = 0.4;

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
          opacity: 0.7 - additionalShadowFade * jumpRatio
        }
      }),

      h('image', {
        attrs: {
          href: '/character.png',
          x: player.position.x - size / 2,
          y: player.position.y - jumpY - size / 2,
          width: size,
          height: size,
          transform
        }
      }),

      h('text', {
        attrs: {
          x: player.position.x,
          y: player.position.y + size - 8,
          'text-anchor': 'middle',
        }
      }, player.name.slice(0, 6)),

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
      }),

      ...renderHealthBar(player)
    ])
  )
}

function renderHealthBar (player: PlayerState | EnemyState) {
  const width = 50;
  const height = 6;
  const healthRatio = player.health / player.maxHealth;
  const yOffset = 65;

  return [
    h('rect', {
      attrs: {
        fill: 'red',
        stroke: 'black',
        x: player.position.x - width / 2,
        y: player.position.y + yOffset - height / 2,
        width,
        height
      }
    }),

    h('rect', {
      attrs: {
        fill: 'lime',
        x: player.position.x - width / 2,
        y: player.position.y + yOffset - height / 2,
        width: width * healthRatio,
        height: height
      }
    })
  ]
}

function jumpHeight (attackProgress: number, attackLength: number): number {
  if (attackProgress === 0) {
    return 0;
  }

  const ratio = (attackProgress / attackLength - 0.5) * 2;
  const jumpHeight = 30;

  return jumpHeight - jumpHeight * Math.abs(ratio * ratio);
}

function renderEnemy (enemy: EnemyState, time: number, playerTarget: EnemyTarget | null) {
  const size = 64;

  let transform = `scale(1, 1)`;

  if (isMovingLeft(enemy)) {
    transform = `translate(${enemy.position.x * 2}, 0), scale(-1, 1)`;
  }

  if (enemy.mode === 'MOVING') {
    transform += ` rotate(${Math.sin(time / 50) * 10 % 360} ${enemy.position.x} ${enemy.position.y})`;
  }

  const jumpY = jumpHeight(enemy.attackProgress, enemy.attackLength);
  const jumpHeightTotal = 30;
  const jumpRatio = jumpY / jumpHeightTotal;
  const additionalShadowFade = 0.4;

  const beingTargeted = playerTarget && playerTarget.id === enemy.id;

  return (
    h('g', {attrs: {x: enemy.position.x, y: enemy.position.y}}, [
      h('ellipse', {
        class: {
          shadow: true
        },

        attrs: {
          cx: enemy.position.x,
          cy: enemy.position.y + size / 2 - 3,

          rx: size / (3 + 2 * jumpRatio),
          ry: size / (5 + 3 * jumpRatio),
          fill: 'url(#fadeOut)',
          opacity: 0.7 - additionalShadowFade * jumpRatio
        }
      }),

      beingTargeted ? h('ellipse', {
        attrs: {
          cx: enemy.position.x,
          cy: enemy.position.y + size / 2 - 3,

          rx: size / 3,
          ry: size / 5,
          fill: 'none',
          stroke: 'red',
          'stroke-width': 2,
          opacity: 0.7
        }
      }) : '',

      h('image', {
        class: {
          enemy: true
        },

        attrs: {
          id: enemy.id,
          href: '/goblin.png',
          x: enemy.position.x - size / 2,
          y: enemy.position.y - jumpY - size / 2,
          width: size,
          height: size,
          transform
        }
      }),

      h('text', {
        attrs: {
          x: enemy.position.x,
          y: enemy.position.y + size - 8,
          'text-anchor': 'middle',
        }
      }, enemy.name),

      ...renderHealthBar(enemy)
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

function renderInventory (inventory) {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const width = (64 + 8) * 8 + 8;
  const height = 80;

  const slots = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    h('g', [
      h('rect', {
        attrs: {
          x: windowWidth / 2 - width / 2,
          y: windowHeight - height,
          width,
          height,
          fill: '#343'
        }
      }),

      ...slots.map(i => (
        h('rect', {
          attrs: {
            x: 8 + windowWidth / 2 - width / 2 + i * 72,
            y: 8 + windowHeight - height,
            width: 64,
            height: 64,
            fill: '#565'
          }
        })
      )),

      ...inventory.map((item, index) => (
        h('image', {
          attrs: {
            href: '/scroll.png',
            x: 8 + windowWidth / 2 - width / 2 + index * 64,
            y: 8 + windowHeight - height,
            width: 64,
            height: 64
          }
        })
      ))
    ])
  )
}

function view ([id, state]) {
  const time = new Date().getTime();
  const player = state.players[id];

  const groups = [
    ...Object.values(state.players).map(player => renderPlayer(player, time)),
    ...state.enemies.map(enemy => renderEnemy(enemy, time, player.target))
  ];

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

      ...groups.sort((a, b) => a.data.attrs.y - b.data.attrs.y),

      renderInventory(player.inventory)
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

  const attack$ = sources.DOM
    .select('.enemy')
    .events('click')
    .debug(event => event.stopPropagation())
    .map(event => ({type: 'ATTACK', data: event.target.id}));

  const chat$ = sources.DOM
    .select('document')
    .events('keydown')
    .map(event => ({type: 'CHAT', data: event.key}));

  const action$ = xs.merge(
    move$,
    chat$,
    attack$
  );

  const gameActionWithId$ = id$
    .map(id => action$.map(action => ({...action, id})))
    .flatten();

  const gameAction$ = xs.merge(gameActionWithId$, stateOverride$);

  const state$ = Game({
    Animation: sources.Animation,
    action$: gameAction$ as Stream<Action>
  });

  return {
    DOM: xs.combine(id$, state$).map(view),
    Socket: action$
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
  Socket: makeWebSocketDriver(new WebSocket(`ws://${location.host}/websocket`))
};

run(Client, drivers);

