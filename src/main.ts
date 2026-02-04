import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws'; // <-- add this
import * as dotenv from 'dotenv';
import * as express from 'express';
import { join } from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Use ws adapter for WebSocket
  app.useWebSocketAdapter(new WsAdapter(app)); // <-- add this

  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({
    origin: ['http://72.60.209.99:5000', 'http://localhost:8080'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: false,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  // await app.listen(3005);
  await app.listen(3005, '0.0.0.0');
}
bootstrap();
