import * as uuid from 'uuid';
import xs, {Stream} from 'xstream';

import {Vector, add, subtract, multiply, normalize, pythag} from './vector';

interface GameSources {
  Animation: any,
  action$: Stream<Action>
}

interface Action {
  type: 'CONNECT' | 'DISCONNECT' | 'MOVE' | 'UPDATE' | 'OVERRIDE' | 'CHAT' | 'ATTACK',
  id?: string,

  data?: any
}

interface GameState {
  players: { [id: string]: PlayerState },
  enemies: Array<EnemyState>
}

interface EnemyTarget {
  type: 'ENEMY',
  id: string
}

interface PlayerState {
  id: string,
  name: string,
  position: Vector,

  target: null | EnemyTarget

  mode: 'MOVING' | 'ATTACKING' | 'WAITING',
  destination: null | Vector,
  chat: Array<ChatMessage>,
  chatting: Boolean,
  newMessage: string,

  health: number,
  maxHealth: number,

  attackLength: number,
  attackProgress: number,
  attackTimeoutLength: number,
  attackTimeoutProgress: number,

  damage: number,
  speed: number
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
  damage: number,
  freezeAllMotorFunctions: boolean,
  speed: number
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
      const ATTACK_RANGE = 80;
      const player = state.players[playerId];

      if (player.attackTimeoutProgress < player.attackTimeoutLength) {
        player.attackTimeoutProgress += delta;
      }

      let target;
      if (player.target) {
        target = state.enemies.find(enemy => enemy.id === player.target.id);

        if (target) {
          player.destination = target.position;
        } else {
          player.mode = 'WAITING';
          player.target = null;
          player.destination = null;
        }
      }

      if (!player.destination) {
        player.mode = 'WAITING';
        return state;
      }

      const destinationDistance = subtract(player.destination, player.position);
      const distance = pythag(destinationDistance);

      if (target && player.mode === 'ATTACKING') {
        player.attackProgress += delta;

        if (player.attackProgress > player.attackLength) {
          const distanceToTarget = pythag(subtract(target.position, player.position));

          if (distanceToTarget <= ATTACK_RANGE) {
            target.health -= player.damage;
          }

          player.mode = 'WAITING';
          player.attackTimeoutProgress = 0;
          player.attackProgress = 0;
        }

        return player;
      }

      if (player.target && distance < ATTACK_RANGE - 10 && player.attackTimeoutProgress > player.attackTimeoutLength) {
        player.mode = 'ATTACKING';
        return;
      }

      if (player.target && distance < ATTACK_RANGE - 10) {
        player.mode = 'WAITING';
        return;
      }

      if (distance > player.speed) {
        player.position = add(player.position, multiply(normalize(destinationDistance), delta * player.speed));
      } else {
        player.mode = 'WAITING';
        player.position = player.destination;
        player.destination = null;
      }
    });

    const TARGET_DISTANCE = 400;

    state.enemies = state.enemies.map(enemy => {
      const ATTACK_RANGE = 80;
      if (enemy.freezeAllMotorFunctions) {
        return enemy;
      }

      const nearbyEnemies = state.enemies.filter(other => {
        return other !== enemy && pythag(subtract(other.position, enemy.position)) < 40;
      });

      nearbyEnemies.forEach(other => {
        const difference = normalize(subtract(other.position, enemy.position));


        other.position = add(other.position, difference);
      });

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

            if (targetPlayer.mode === 'WAITING') {
              if (!targetPlayer.target) {
                targetPlayer.target = {type: 'ENEMY', id: enemy.id};
                targetPlayer.mode = 'MOVING';
              }
            }
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

      if (enemy.target && distance < ATTACK_RANGE - 10 && enemy.attackTimeoutProgress > enemy.attackTimeoutLength) {
        enemy.mode = 'ATTACKING';
        return enemy;
      }

      enemy.mode = 'MOVING';

      if (distance > ATTACK_RANGE - 10) {
        enemy.position = add(enemy.position, multiply(normalize(destinationDistance), delta * enemy.speed));
      } else {
        enemy.mode = 'WAITING';
      }

      return enemy;
    });

    state.enemies = state.enemies.filter(enemy => enemy.health > 0);

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
          mode: 'WAITING',
          target: null,
          destination: null,
          chat: [],
          chatting: false,
          newMessage: '',
          maxHealth: 100,
          health: 100,
          attackLength: 400 / 16,
          attackProgress: 0,
          attackTimeoutLength: 1200 / 16,
          attackTimeoutProgress: 0,
          damage: 20,
          speed: 5
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
          destination: action.data,
          mode: 'MOVING',
          target: null,
          attackProgress: 0
        }
      }
    }
  }

  if (action.type === 'ATTACK') {
    return {
      ...state,

      players: {
        ...state.players,

        [action.id]: {
          ...state.players[action.id],
          target: {type: 'ENEMY', id: action.data as string},
          mode: 'MOVING'
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

function Goblin(position: Vector): EnemyState {
  return {
    id: uuid.v4(),
    name: 'Goblin',
    position,
    destination: null,
    target: null,
    health: 100,
    maxHealth: 100,
    mode: 'WAITING',
    attackLength: 400 / 16,
    attackProgress: 0,
    attackTimeoutLength: 1200 / 16,
    attackTimeoutProgress: 0,
    damage: 10,
    freezeAllMotorFunctions: false,
    speed: 4
  };
}

function Game (sources: GameSources) {
  const initialState : GameState = {
    players: {},
    enemies: [
      Goblin({x: 300, y: 300}),
      Goblin({x: 300, y: 400}),
      Goblin({x: 400, y: 300}),
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
  EnemyTarget,
  GameState,
  Action
}
