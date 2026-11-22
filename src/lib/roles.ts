import { Role } from "@prisma/client";

export type AppRole = Role;

/** Admin only: Upload / Remark / Users */
export function canUpload(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function canManageUsers(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function canAccessRemark(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function canDeleteData(role: AppRole): boolean {
  return role === Role.ADMIN;
}

export function isManager(role: AppRole): boolean {
  return role === Role.MANAGER;
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
