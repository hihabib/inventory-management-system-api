import http from 'http';
import app from './api/v1/index';
import { PORT } from './api/v1/config/env';


const server = http.createServer(app);


// server.listen(Number(PORT), "0.0.0.0", () => {
server.listen(Number(PORT),  () => {
    console.log(`Server is running on port ${PORT}`);
});
