import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as ws from 'ws';
import {run} from '@cycle/xstream-run';
import xs from 'xstream';

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
    let connections = [];
    const {observer, stream} = streamAdapter.makeSubject();
    const newConnection$ = xs.create();

    sink$.addListener({
      next (event) {
        if (event.type === 'BROADCAST') {
          console.log(`broadcasting to all connections`, connections.length);
          console.log(event.data);
          connections.forEach(connection => {
            connection.send(JSON.stringify(event.data));
          });
        } else if (event.type === 'SEND') {
          connections[event.id].send(JSON.stringify(event.data));
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
      const id = connections.length;
      console.log(`id: ${id}`);
      connections.push(ws);
      newConnection$.shamefullySendNext(id);

      ws.on('message', (message) => {
        console.log(`received message from ${id}: ${message}`);
        observer.next({message, id});
      });

      ws.on('close', () => {
        connections = connections.filter(other => ws !== other);
      });
    });

    return {
      messages: stream,
      connections: newConnection$
    };
  }
}

const drivers = {
  Socket: makeWebSocketDriver(webSocketServer)
}

interface State {
  messages: Array<string>
}

function reduceMessage (state: State, event): State {
  return {
    ...state,

    messages: state.messages.concat(event.message)
  }
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

function Server (sources) {
  const initialState = {
    messages: []
  };

  const state$ = sources.Socket.messages
    .fold(reduceMessage, initialState).debug('state');

  const stateUpdate$ = state$.map(broadcast);

  const newConnection$ = sources.Socket.connections;

  const newClientState$ = state$
    .map(state => newConnection$.map(id => send(id, state)))
    .flatten();

  const socket$ = xs.merge(
    stateUpdate$,
    newClientState$
  );

  return {
    Socket: socket$
  }
}

run(Server, drivers);

server.listen(8000, () => console.log(`Listening on localhost:8000`));
