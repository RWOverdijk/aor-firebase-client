import firebase from 'firebase'

import {
  GET_LIST,
  GET_ONE,
  GET_MANY,
  GET_MANY_REFERENCE,
  CREATE,
  UPDATE,
  DELETE
} from 'admin-on-rest'

export default (trackedResources = [], firebaseConfig = {}) => {

  /** TODO Move this to the Redux Store */
  const resourcesStatus = {}
  const resourcesReferences = {}
  const resourcesData = {}

  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }

  trackedResources.map(resource => {
    resourcesStatus[resource] = new Promise(resolve => {
      let ref = resourcesReferences[resource] = firebase.database().ref(resource);
      resourcesData[resource] = {}

      ref.on('value', function(childSnapshot) {
        /** Uses "value" to fetch initial data. Avoid the AOR to show no results */
        if (childSnapshot.key === resource)
          resourcesData[resource] = childSnapshot.val()
        Object.keys(resourcesData[resource]).map(key => resourcesData[resource][key].id = key)
        ref.on('child_added', function(childSnapshot) {
          resourcesData[resource][childSnapshot.key] = childSnapshot.val()
          resourcesData[resource][childSnapshot.key].id = childSnapshot.key
        });
        ref.on('child_removed', function(oldChildSnapshot) {
          if (resourcesData[resource][oldChildSnapshot.key])
            delete resourcesData[resource][oldChildSnapshot.key]
        });
        ref.on('child_changed', function(childSnapshot) {
          resourcesData[resource][childSnapshot.key] = childSnapshot.val()
        });
        resolve();
      });
    })
  })

  /**
   * @param {string} type Request type, e.g GET_LIST
   * @param {string} resource Resource name, e.g. "posts"
   * @param {Object} payload Request parameters. Depends on the request type
   * @returns {Promise} the Promise for a REST response
   */

  return (type, resource, params) => {
    return new Promise((resolve, reject) => {
      resourcesStatus[resource].then(() => {
        switch (type) {
          case GET_LIST:
          case GET_MANY:
          case GET_MANY_REFERENCE:

            let ids = []
            let data = []
            let total = 0

            if (params.ids) {
              /** GET_MANY */
              params.ids.map(key => {
                if (resourcesData[resource][key]) {
                  ids.push(key)
                  data.push(resourcesData[resource][key])
                  total++
                }
              })

            } else if (params.pagination) {
              /** GET_LIST / GET_MANY_REFERENCE */
              const {page, perPage} = params.pagination
              const _start = (page - 1) * perPage
              const _end = page * perPage
              const values = Object.values(resourcesData[resource])
              data = values.slice(_start, _end)
              ids = Object.keys(resourcesData[resource]).slice(_start, _end)
              total = values.length
            } else {
              console.error('Unexpected parameters: ', params, type)
              reject()
            }
            resolve({ data, ids, total })
            return

          case GET_ONE:
            const key = params.id
            if (key && resourcesData[resource][key]) {
              resolve({
                data: resourcesData[resource][key]
              })
            } else {
              reject()
            }
            return

          case DELETE:
            firebase.database().ref(params.basePath + '/' + params.id).remove()
            .then(() => { resolve({ data: params.id }) })
            .catch(reject)
            return

          case UPDATE:
            console.log(type, params)
            const updatedData = Object.assign({}, resourcesData[resource][params.id], params.data)
            firebase.database().ref(params.basePath + '/' + params.id).update(updatedData)
              .then(() => {
                resolve({
                  data: updatedData
                })
              })
              .catch(reject)
            return

          case CREATE:
            const newItemKey = firebase.database().ref().child(params.basePath).push().key;
            const createdData = Object.assign({}, params.data, { id: newItemKey, key: newItemKey })
            firebase.database().ref(params.basePath + '/' + newItemKey).update(createdData)
            .then(() => {
              resolve({
                data: createdData
              })
            })
            .catch(reject)
            return

          default:
            console.log(type)
            return {data: []}
        }
      })
    })
  }
}
