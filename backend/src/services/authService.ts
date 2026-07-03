import { prisma } from '../prisma.js'
import { UnauthorizedError, NotFoundError, BadRequestError } from '../lib/errors.js'
import { generateJwtToken, generateRefreshToken, hashPassword, verifyPassword } from '../lib/auth.js'
import * as tenantService from './tenantService.js'
import type { LoginInput, RegisterInput } from '../types.js'
import type { Tenant, User } from '@prisma/client'

export interface UserDto {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

export interface TenantDto {
  id: string
  name: string
  domain: string
  plan: string
  isActive: boolean
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: UserDto
  tenant: TenantDto
}

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenantId,
  }
}

function toTenantDto(tenant: Tenant): TenantDto {
  return {
    id: tenant.id,
    name: tenant.name,
    domain: tenant.domain,
    plan: tenant.plan,
    isActive: tenant.isActive,
  }
}

export async function register(input: RegisterInput): Promise<LoginResponse> {
  const existingUser = await prisma.user.findFirst({ where: { email: input.email } })
  if (existingUser) {
    throw new BadRequestError('Email already registered')
  }

  const tenant = await tenantService.createTenant(input.tenantName, input.domain)

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: input.email,
      passwordHash: hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'Admin',
      isActive: true,
    },
  })

  const token = generateJwtToken(user, tenant)
  const refreshToken = generateRefreshToken()

  return { token, refreshToken, user: toUserDto(user), tenant: toTenantDto(tenant) }
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await prisma.user.findFirst({
    where: { email: input.email },
    include: { tenant: true },
  })

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new UnauthorizedError('Invalid credentials')
  }

  if (!user.isActive || !user.tenant.isActive) {
    throw new UnauthorizedError('Account is inactive')
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  const token = generateJwtToken(updated, user.tenant)
  const refreshToken = generateRefreshToken()

  return { token, refreshToken, user: toUserDto(updated), tenant: toTenantDto(user.tenant) }
}

export async function getUserById(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')
  return toUserDto(user)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new UnauthorizedError('Current password is incorrect')
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(newPassword) },
  })
}
