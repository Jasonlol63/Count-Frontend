# Process Copy From — 前端改动

Games Process 的 Add Process 弹窗有一个 Copy From 下拉，用来复制一个已存在 process 的全部配置
（含 formula）建一个新 process。这份文档只记录**前端**为了配合这个功能所做的改动
（后端实现见 `Count` 仓库的 `docs/process-copy-from-and-delete-guards.md`）。

## 涉及文件

- `Count-frontend/src/pages/processlist/components/ProcessFormModal.jsx`
- `Count-frontend/src/pages/processlist/ProcessListPage.jsx`
- `Count-frontend/src/pages/processlist/processListApi.js`

## 改动 1：修了一个既有 bug —— Copy From 选项一直选不中

**文件**：`ProcessFormModal.jsx`

**现象**：点击 Copy From 下拉里的任意一个选项，表单都不会被预填，等同于什么都没选。

**原因**：下拉选项数据来自 `form.existingProcesses`（`ProcessListPage.jsx` 里由已加载的
process 列表行 `rows.map(r => ({ ...r, description_name: r.description }))` 构造），
这些行的主键字段是 `id`，但 `ProcessFormModal.jsx` 里取值时用的是 `p.process_id`——
这个字段在数据里根本不存在，永远是 `undefined`。于是每次点击选项，实际传给
`onCopyFromSelect` 的都是 `String(p.process_id ?? "")` = 空字符串，等同于触发"清空"分支。

**修复**：把 5 处 `p.process_id` 全部改成 `p.id`：

```diff
- String(p.process_id) === String(form.copy_from) ||   // selectedCopyRow 匹配
+ String(p.id) === String(form.copy_from) ||

- if (p) applyCopyFromSelection(String(p.process_id ?? ""));   // 键盘选择（按钮 / 输入框），共 2 处
+ if (p) applyCopyFromSelection(String(p.id ?? ""));

- key={`${p.process_id}_${p.description_name || ""}`}   // 选项列表 key
+ key={`${p.id}_${p.description_name || ""}`}

- onClick={() => applyCopyFromSelection(String(p.process_id ?? ""))}   // 鼠标点击选项
+ onClick={() => applyCopyFromSelection(String(p.id ?? ""))}
```

修复后，选中某个选项会正确调用 `onCopyFromSelect(id)` → `ProcessListPage.jsx` 的
`handleCopyFromSelect` → 用 `id` 在 `rowsRef.current` 里找到对应行 → `buildCopyFromFormPatch`
预填表单（currency、remove/replace word、remark、description、day use）。这一步只是本地预填，
不发网络请求。

## 改动 2：提交时把选中的来源 process 一并带给后端

之前 Copy From 只做到"预填表单"，保存的时候并没有把"这是复制自谁"这个信息发给后端——
新 process 就是拿预填好的字段当普通表单值提交，后端完全不知道这是一次 Copy From。

**`ProcessListPage.jsx`（`submitForm`）**：非编辑模式下，如果 `form.copy_from` 有值，
转成数字 `copyFromProcessId` 塞进 `sharedFields`：

```js
const copyFromProcessId = !editMode && form.copy_from ? Number(form.copy_from) : null;
if (Number.isFinite(copyFromProcessId) && copyFromProcessId > 0) {
  sharedFields.copyFromProcessId = copyFromProcessId;
}
```

`sharedFields` 会随每一个新建请求一起提交——Multi-Process 场景下（一次勾选多个新 code 批量创建），
这些新 code 会共享同一个 `copyFromProcessId`，即"这批新建的 process 都复制自同一个来源"。
编辑模式（`updateProcess`）不带这个字段，后端也不会读它，纯新增场景专用。

**`processListApi.js`（`addProcess()`）**：从 `fields.copyFromProcessId` 读取，
校验是正整数后才放进请求体：

```js
const copyFromProcessId = Number(fields?.copyFromProcessId);
if (Number.isFinite(copyFromProcessId) && copyFromProcessId > 0) {
  body.copyFromProcessId = copyFromProcessId;
}
```

对接的是后端 `POST /api/process/add-process` 的 `ProcessDTO.copyFromProcessId` 字段——
后端拿到这个 id 后会**重新从数据库权威读取**源 process 的数据来做真正的深拷贝（包括 formula），
不会信任前端已经预填好的表单值。

## 没有改动的地方

- Copy From 下拉本身的渲染、搜索、键盘导航逻辑（`ProcessFormPortalSelect` 相关）没有动，
  只改了取值字段名。
- 表单校验（必须选 currency、必须至少一个 description）逻辑不变——Copy From 预填后这些字段
  自然会被填上，走的还是原有的必填校验路径。
- 删除 process 的相关校验（有 transaction 数据不允许删）是纯后端逻辑，前端不需要任何改动，
  报错会走现有的 `BusinessException → { success:false, message }` → 前端 notify 提示链路。
