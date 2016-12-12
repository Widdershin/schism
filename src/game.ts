import xs, {Stream} from 'xstream';

import {Vector, add, subtract, multiply, normalize, pythag} from './vector';

interface GameSources {
  Animation: any,
  action$: Stream<Action>
}

export interface Action {
  type: 'CONNECT' | 'DISCONNECT' | 'MOVE' | 'UPDATE' | 'OVERRIDE',
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
  destination: null | Vector
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
          destination: null
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
  Game
}
