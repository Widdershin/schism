import * as uuid from 'uuid';
import xs, {Stream} from 'xstream';

import {Vector, add, subtract, multiply, normalize, pythag} from './vector';

interface GameSources {
  Animation: any,
  action$: Stream<Action>
}

interface Action {
  type: 'CONNECT' | 'DISCONNECT' | 'MOVE' | 'UPDATE' | 'OVERRIDE' | 'CHAT',
  id?: string,

  data?: any
}

interface GameState {
  players: { [id: string]: PlayerState }
}

interface PlayerState {
  id: string,
  name: string,
  position: Vector,
  destination: null | Vector,
  chat: Array<ChatMessage>,
  chatting: Boolean,
  newMessage: string
}

interface ChatMessage {
  text: string,
  time: number,
  id: string
}

function applyAction (state: GameState, action: Action): GameState {
  if (action.type === 'OVERRIDE') {
    return action.data;
  }

  if (action.type === 'UPDATE') {
    const delta = action.data;

    Object.keys(state.players).forEach(playerId => {
      const player = state.players[playerId];

      if (!player.destination) {
        return state;
      }

      const destinationDistance = subtract(player.destination, player.position);

      const speed = 5;

      if (pythag(destinationDistance) > speed) {
        player.position = add(player.position, multiply(normalize(destinationDistance), delta * speed));
      } else {
        player.position = player.destination;
        player.destination = null;
      }
    });

    return state;
  }

  if (action.type === 'CONNECT') {
    return {
      ...state,

      players: {
        ...state.players,

        [action.id]: {
          id: action.id,
          name: action.id,
          position: {
            x: 100 + 600 * Math.random(),
            y: 100
          },
          destination: null,
          chat: [],
          chatting: false,
          newMessage: ''
        }
      }
    }
  }

  if (action.type === 'DISCONNECT') {
    delete state.players[action.id];

    return state;
  }

  if (action.type === 'MOVE') {
    return {
      ...state,

      players: {
        ...state.players,

        [action.id]: {
          ...state.players[action.id],
          destination: action.data
        }
      }
    }
  }

  if (action.type === 'CHAT') {
    const player = state.players[action.id];

    if (!player.chatting && action.data === 'Enter') {
      return {
        ...state,

        players: {
          ...state.players,

          [player.id]: {
            ...player,

            chatting: true
          }
        }
      }
    }

    if (player.chatting && action.data === 'Enter') {
      const newMessage = {
        text: player.newMessage,
        id: uuid.v4(),
        time: new Date().getTime()
      };

      return {
        ...state,

        players: {
          ...state.players,

          [player.id]: {
            ...player,

            chat: [newMessage].concat(player.chat),
            chatting: false,
            newMessage: ''
          }
        }
      }
    }

    if (!player.chatting) {
      return state;
    }

    if (action.data.length > 1) {
      if (action.data === 'Backspace') {
        return {
          ...state,

          players: {
            ...state.players,

            [player.id]: {
              ...player,
              newMessage: player.newMessage.slice(0, -1)
            }
          }
        }
      }

      return state;
    }

    return {
      ...state,

      players: {
        ...state.players,

        [player.id]: {
          ...player,
          newMessage: player.newMessage + action.data
        }
      }
    }
  }

  return state;
}

function Game (sources: GameSources) {
  const initialState : GameState = {
    players: {}
  };

  const update$ = sources.Animation.map(({delta}) => {
    const normalizedDelta = delta / (1000 / 60)

    return {
      type: 'UPDATE',
      data: normalizedDelta
    }
  });

  const action$ = xs.merge(update$, sources.action$);

  return action$.fold(applyAction, initialState);
}

export {
  Game,
  PlayerState,
  GameState,
  Action
}
