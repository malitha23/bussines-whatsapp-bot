export interface JwtPayload {
  sub: number;
  email: string;
  role_type: 'super_admin' | 'owner' | 'manager' | 'staff';
  iat?: number;
  exp?: number;
}
