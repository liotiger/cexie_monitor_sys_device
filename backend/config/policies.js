module.exports.policies = {
  '*': ['isAuthenticated'],
  
  'AuthController': {
    'login': true,
    'register': true,
    'clientHelper': true,
    'logout': ['isAuthenticated'],
    'me': ['isAuthenticated']
  },

  'AdminCallbackController': {
    'receiveTaskCallback': true
  },
  
  'UserController': {
    'find': ['isAuthenticated', 'isAdmin'],
    'findOne': ['isAuthenticated'],
    'create': ['isAuthenticated', 'isAdmin'],
    'update': ['isAuthenticated'],
    'destroy': ['isAuthenticated', 'isAdmin']
  },
  
  'DashboardController': {
    'stats': ['isAuthenticated']
  }
};
