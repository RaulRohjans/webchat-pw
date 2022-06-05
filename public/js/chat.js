const io = require('socket.io-client');

const url = new URL(window.location.href);
const socket = io(url.protocol + '//' + url.hostname + ':8081' /*+ url.port*/)

const roomID = window.location.href.split("/").pop();
const messageInput = document.getElementById('messageInputArea')
const messageSendBtn = document.getElementById('send-message-btn')

socket.on('connect', () => {
    //Join Room
    socket.emit('join-room', roomID, currentUsername)

    messageSendBtn.addEventListener("click", () => {
        if(messageInput.value.trim() !== "") {
            socket.emit('send-message', messageInput.value.trim(), roomID)
            addMessage(messageInput.value.trim(), true)
            messageInput.value = '';
        }
    })
})

socket.on('user-join', (currentUser) => {
    changeOnlineStatus(currentUser, true)
    console.log("Joined USer!")
})

socket.on('receive-message', (message) => {
    addMessage(message, false)
})

function changeOnlineStatus(idUser, isOnline) {
    const userList = document.getElementById('user-wrapper').getElementsByTagName("li");

    for(let i = 0; i < userList.length; i++){
        if(userList[i].id === idUser){
            const spanElem = userList[i].getElementsByClassName("user")[0]
                .getElementsByTagName("span")[0];

            if(spanElem){ //If it's a group chat
                if(isOnline === true)
                    spanElem.className = 'status online';
                else
                    spanElem.className = 'status busy';
            }
            break;
        }
    }

}

function addMessage(message, isSent) {
    const messageWrapper = document.getElementById('message-wrapper')
    const li = document.createElement("li")

    if(isSent === true)
        li.classList.add("chat-right");
    else
        li.classList.add("chat-left");

    const d = new Date()
    li.innerHTML += '<div class="chat-avatar">' +
        '<img src="https://www.bootdey.com/img/Content/avatar/avatar3.png" alt="Retail Admin">' +
        '<div class="chat-name">Russell</div>' +
        '</div>' +
        '<div class="chat-text">' +
        message.replaceAll("\n", "<br />") +
        '</div>' +
        '<div class="chat-hour">' +
        (d.getHours()<10?'0':'') + d.getHours() + ':' +
        (d.getMinutes()<10?'0':'') + d.getMinutes() +
        ' <span class="fa fa-check-circle"></span></div>' +
        '</li>';

    messageWrapper.appendChild(li);
    updateScroll();
}