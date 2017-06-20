import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import * as uuid from 'node-uuid';
import * as path from 'path';
import * as ws from 'ws';
import {run} from '@cycle/xstream-run';
import {makeAnimationDriver} from 'cycle-animation-driver';
import xs, {Stream} from 'xstream';
import throttle from 'xstream/extra/throttle';

import {Game, Action} from './game';

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const webSocketServer = new ws.Server({server, path: '/websocket'});


function makeWebSocketDriver (socketServer) {
  return function socketDriver (sink$, streamAdapter) {
    let connections = {};
    const {observer, stream} = streamAdapter.makeSubject();
    const newConnection$ = xs.create();
    const disconnection$ = xs.create();

    sink$.addListener({
      next (event) {
        if (event.type === 'BROADCAST') {
          Object.values(connections).forEach(connection => {
            (connection as any).send(JSON.stringify(event.data), (err) => {
              if (err) {
                console.error(err);
              }
            });
          });
        } else if (event.type === 'SEND') {
          connections[event.id].send(JSON.stringify(event.data), (err) => {
            if (err) {
              console.error(err);
            }
          });
        } else {
          throw new Error(`Unrecognized event ${event}`);
        }
      },

      error (err) {
        console.error(err);
      }
    });

    socketServer.on('connection', (ws) => {
      console.log('Connected!')
      // TODO actually do ids well
      const id = uuid.v4();
      console.log(`id: ${id}`);
      connections[id] = ws;
      newConnection$.shamefullySendNext(id);

      ws.on('message', (data) => {
        console.log(`received message from ${id}: ${data}`);
        observer.next({data: JSON.parse(data), id});
      });

      ws.on('close', () => {
        console.log('closed', id);
        delete connections[id];
        disconnection$.shamefullySendNext(id);
      });
    });

    return {
      messages: stream,
      connections: newConnection$,
      disconnections: disconnection$
    };
  }
}

const drivers = {
  Animation: makeAnimationDriver(),
  Socket: makeWebSocketDriver(webSocketServer)
}

function send (id, data) {
  return {
    type: 'SEND',
    id,
    data
  }
}

function broadcast (data) {
  return {
    type: 'BROADCAST',
    data
  }
}

// game
// takes in actions with player id
// takes in animation stream
//
// fold over all information to create game state
//

function Server (sources) {
  const playerAction$ = sources.Socket.messages.debug('message')
    .map(message => ({id: message.id, data: message.data.data, type: message.data.type}));

  const playerConnection$ = sources.Socket.connections
    .map(id => ({id, type: 'CONNECT'}));

  const playerDisconnection$ = sources.Socket.disconnections
    .map(id => ({id, type: 'DISCONNECT'}));

  const gameAction$ = xs.merge(
    playerAction$,
    playerConnection$,
    playerDisconnection$
  );

  const state$ = Game({
    Animation: sources.Animation,
    action$: gameAction$ as Stream<Action>
  });

  const stateForClients$ = state$
    .map(state => ({type: 'UPDATE_STATE', data: state}));

  const stateUpdate$ = stateForClients$.map(broadcast);

  const newConnection$ = sources.Socket.connections;

  const newClientState$ = stateForClients$
    .map(state => newConnection$.map(id => send(id, state)))
    .flatten();

  const setClientId$ = newConnection$
    .map(id => send(id, {type: 'SET_ID', data: id}));

  const socket$ = xs.merge(
    stateUpdate$,
    newClientState$,
    setClientId$
  );

  return {
    Socket: socket$
  }
}

server.listen(8000, () => console.log(`Listening on localhost:8000`));
run(Server, drivers);
