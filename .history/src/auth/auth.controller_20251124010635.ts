import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

// Type guard for ValidationPipe / HttpException
function isHttpException(
  err: unknown,
): err is { response?: { message?: any } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // ---------------------------
  // Register
  // ---------------------------
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    try {
      const { user, businessId } = await this.authService.register(registerDto);
      const tokens = await this.authService.login(user as any);

      return {
        status: 'success',
        message: 'User registered successfully',
        data: { user, tokens, businessId },
      };
    } catch (err: unknown) {
      let errorMessage = 'Registration failed';

      if (isHttpException(err) && err.response?.message) {
        if (Array.isArray(err.response.message)) {
          errorMessage = err.response.message.join(', ');
        } else if (typeof err.response.message === 'string') {
          errorMessage = err.response.message;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      return {
        status: 'error',
        message: 'Registration failed',
        error: errorMessage,
      };
    }
  }

  // ---------------------------
  // Login
  // ---------------------------
@Post('login')
async login(@Body() loginDto: LoginDto) {
  try {
    const data = await this.authService.loginUser(loginDto);
    return {
      status: 'success',
      message: 'Login successful',
      data,
    };
  } catch (err: unknown) {
    let errorMessage = 'Login failed';

    if (isHttpException(err) && err.response?.message) {
      errorMessage = Array.isArray(err.response.message)
        ? err.response.message.join(', ')
        : err.response.message;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    return {
      status: 'error',
      message: 'Login failed',
      error: errorMessage,
    };
  }
}



  // ---------------------------
  // Protected profile route
  // ---------------------------
  @UseGuards(JwtAuthGuard)
  @Post('profile')
  getProfile(@Req() req: Request & { user: JwtPayload }) {
    return {
      status: 'success',
      data: req.user,
    };
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    const tokens = await this.authService.refresh(body.refresh_token);
    return {
      status: 'success',
      message: 'Token refreshed successfully',
      data: tokens,
    };
  }
}
