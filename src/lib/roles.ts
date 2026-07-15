import { Role } from "@prisma/client";

export type AppRole = Role;

export function canUpload(role: AppRole): boolean {
  return role === Role.ADMIN || role === Role.MANAGER;
}

export function canManageUsers(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function canDeleteData(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function roleLabel(role: AppRole): string {
  switch (role) {
    case Role.ADMIN:
      return "Admin";
    case Role.MANAGER:
      return "Manager";
    case Role.USER:
      return "User";
  }
}
