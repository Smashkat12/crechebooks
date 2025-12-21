import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IUser } from '../../../database/entities/user.entity';

interface RequestWithUser extends Request {
  user?: IUser;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof IUser | undefined,
    ctx: ExecutionContext,
  ): IUser | IUser[keyof IUser] => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return undefined as unknown as IUser;
    }

    return data ? user[data] : user;
  },
);
