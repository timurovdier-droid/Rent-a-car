// Middleware для проверки ролей пользователя
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // req.user заполняется предыдущим middleware (authenticate)
    if (!req.user || !req.user.role) {
      return res.status(401).json({ 
        error: { code: 'UNAUTHORIZED', message: 'Пользователь не авторизован' } 
      });
    }

    // Проверяем, есть ли роль пользователя в списке разрешенных
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: { code: 'FORBIDDEN', message: 'Недостаточно прав для выполнения этого действия' } 
      });
    }

    // Если роль подходит, передаем управление следующему middleware или обработчику
    next();
  };
}