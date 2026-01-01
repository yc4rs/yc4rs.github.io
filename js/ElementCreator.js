const xmlHttp = new XMLHttpRequest();
xmlHttp.onload = function() {
	let blockList = JSON.parse(this.responseText)["block_list"]

	let divBody = document.createElement('div');
	divBody.className = "div-body";
	document.body.appendChild(divBody);
	
	for(let i = 0;i < blockList.length;i++){
		
		//跳過空值
		if(blockList[i].block_size == undefined || 
		blockList[i].title == undefined ||
		blockList[i].content== undefined){
			console.log("跳過第" + i + "筆資料");
			continue;
		}
		
		//建立divBlock
		let divBlock = document.createElement('div');
		divBlock.className = "div-" + blockList[i].block_size + "-block";
		divBody.appendChild(divBlock);
		
		//建立Title
		let divTitle = document.createElement('div');
		divTitle.className = "div-title";
		divTitle.innerHTML = blockList[i].title;
		divBlock.appendChild(divTitle);
		
		
		// let contentList = JSON.parse(this.responseText.block_list)[i]["content"];
		// console.log(blockList[i].content[0]);
		// console.log(contentList.length);
		for(let j = 0;j < Object.keys(blockList[i].content).length;j++){
			
			//取出Content資料
			let divContentData = blockList[i].content[j];
			
			//跳過空值
			if(divContentData.size == undefined || 
			divContentData.text == undefined ||
			divContentData.url== undefined){
				console.log("跳過第" + j + "筆內容資料");
				continue;
			}
			
			//建立Btn
			let divBtn = document.createElement('div');
			divBtn.className = "div-btn-base div-btn-size-" + divContentData.size;
			divBtn.innerHTML = divContentData.text;
			divBtn.addEventListener('click', function (event) {
				window.open(divContentData.url)
			});
			divBlock.appendChild(divBtn);
			
		}
		// document.body.appendChild(divBlock);
		// console.log(blockList[i]);
		

	}

	console.log(blockList);
  
}
xmlHttp.open("GET", "LinkSetting.txt");
xmlHttp.send();