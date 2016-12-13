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
  players: { [id: string]: PlayerState },
  enemies: Array<EnemyState>
}

interface PlayerState {
  id: string,
  name: string,
  position: Vector,
  destination: null | Vector,
  chat: Array<ChatMessage>,
  chatting: Boolean,
  newMessage: string,

  health: number,
  maxHealth: number
}

interface EnemyState {
  id: string,
  name: string,
  position: Vector,
  target: null | string,
  destination: null | Vector,
  health: number,
  maxHealth: number,
  mode: 'MOVING' | 'ATTACKING' | 'WAITING',
  attackLength: number,
  attackProgress: number,
  attackTimeoutLength: number,
  attackTimeoutProgress: number,
  damage: number
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

    const TARGET_DISTANCE = 400;
    const ATTACK_RANGE = 80;

    state.enemies = state.enemies.map(enemy => {
      if (enemy.attackTimeoutProgress < enemy.attackTimeoutLength) {
        enemy.attackTimeoutProgress += delta;
      }

      if (!enemy.target) {
        const nearbyPlayers = Object.values(state.players).filter(player => pythag(subtract(player.position, enemy.position)) < TARGET_DISTANCE);

        if (nearbyPlayers.length > 0) {
          enemy.target = nearbyPlayers[0].id;
          enemy.mode = 'MOVING';
        }
      }

      let targetPlayer;
      if (enemy.target) {
        targetPlayer = state.players[enemy.target];

        if (targetPlayer) {
          enemy.destination = targetPlayer.position;
        } else {
          enemy.target = null;
          enemy.destination = null;
        }
      }

      if (enemy.mode === 'ATTACKING' && !targetPlayer) {
        enemy.mode = 'WAITING';
      }

      if (enemy.mode === 'ATTACKING') {
        enemy.attackProgress += delta;

        if (enemy.attackProgress > enemy.attackLength) {
          const distanceToTarget = pythag(subtract(targetPlayer.position, enemy.position));

          if (distanceToTarget <= ATTACK_RANGE) {
            targetPlayer.health -= enemy.damage;
          }

          enemy.mode = 'WAITING';
          enemy.attackTimeoutProgress = 0;
          enemy.attackProgress = 0;
        }

        return enemy;
      }

      if (!enemy.destination) {
        enemy.destination = add(enemy.position, {x: Math.random() * 100 - 50, y: Math.random() * 100 - 50});
      }

      const destinationDistance = subtract(enemy.destination, enemy.position);
      const distance = pythag(destinationDistance);

      if (distance < ATTACK_RANGE - 10 && enemy.attackTimeoutProgress > enemy.attackTimeoutLength) {
        enemy.mode = 'ATTACKING';
        return enemy;
      }

      enemy.mode = 'MOVING';
      const speed = 5;

      if (pythag(destinationDistance) > ATTACK_RANGE - 10) {
        enemy.position = add(enemy.position, multiply(normalize(destinationDistance), delta * speed));
      } else {
        enemy.mode = 'WAITING';
      }

      return enemy;
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
          newMessage: '',
          maxHealth: 100,
          health: 100
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
    players: {},
    enemies: [
      {
        id: uuid.v4(),
        name: 'Goblin',
        position: {x: 300, y: 300},
        destination: null,
        target: null,
        health: 100,
        maxHealth: 100,
        mode: 'WAITING',
        attackLength: 400 / 16,
        attackProgress: 0,
        attackTimeoutLength: 1200 / 16,
        attackTimeoutProgress: 0,
        damage: 10
      }
    ]
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
  EnemyState,
  GameState,
  Action
}
