# test-cfw-subrequest

- CloudFlare Workersのサブリクエスト制限を確認するためのサンプルコードです。以下の2つのパターンをテストできます。
  - R2バケット内のオブジェクトへのサブリクエスト (`object->get()`)
  - 外部URLへのサブリクエスト (`fetch()`)

- サブリクエストの上限は、Standardモデルの場合は1つのワーカーあたりにつき1000です。
    - https://developers.cloudflare.com/workers/platform/limits/
  - サービスの申請フォームを使用して上限を引き上げることができますが、回答が来ないケースがあります。
- `1000` 以上のサブリクエストを実行したい場合は、複数のワーカーをService Bindingして回避できます。
  - 接続した各ワーカーで最大1000リクエストまで発行できるため、`必要なリクエスト数 / 1000 (小数点切り上げ)` 個のワーカーに対してService Bindingで接続します。
    このリポジトリのサンプルコードでは、Service Bindingで複数のワーカーに接続することで、制限を回避できることを確認します。

## requirements
- node v20.3.1
- pnpm

## setup
- `main-workers/`, `sub-workers/` ディレクトリで以下を実行します。

```sh
$ pnpm install
$ wrangler login
$ cp wrangler.toml.dist wrangler.toml
```

- `sub-workers/wrangler.toml`を編集し、`R2_TEST_FILE_KEY`と`FETCH_TEST_ENDPOINT_PATH`を設定します。

## deploy
- `main-workers/`、`sub-workers/`  ディレクトリで以下を実行します。

```sh
$ pnpm deploy
```

## execute

**ローカルで起動したworkerについては、サブリクエストの制限がかかりません。**<br>
(1workerで1000リクエスト以上発行してもエラーになりません。)<br>
そのため、制限を確認したい場合は、デプロイして動作確認した方が良いです。


### local
- `main-workers/`, `sub-workers/`  ディレクトリで以下を実行して、ローカルでworkerを起動します。 
```sh
$ pnpm dev
```
- 注意
  - `main-workers`を先に起動し、その後に`sub-workers`を起動してください。その順番で起動しないと、`main-workers`から`sub-workers`に接続できないことがあります。
  - `main-workers`起動時に`--remote`オプションを指定した場合は、R2およびService Bindingの接続先はローカルではなくCloudFlareネットワークになります。
    - serviceBindingで接続される`sub-workers`は、事前にCloudflareにデプロイされたworkerである必要があるため、`sub-workers`は事前にデプロイしておいてください。

### remote

- 以下のようにmain-workersにリクエストを送信します。
  - この場合だと、sub-workerに対して3回ServiceBindingを行い、それぞれ1000リクエスト、1000リクエスト、1リクエストを発行します。
  - CloudFlare の管理コンソールから、`main-workers`のリアルタイムログを確認することで結果が確認できます。
    - 正常完了の場合はステータスコード200が返り、エラーが発生した場合は500が返ります。`max-request-per-worker`が`1001`以上の場合はサブリクエストの上限に達するため500が返ります。
    - `sub-workers`に対して3回リクエストが行われたことが確認できます。

```sh
$ curl -s "${main-workers-url}/?total-request=2001&max-request-per-worker=1000&r2-connection-enabled=true"
```


- クエリパラメータ
    - `total-request` (default: 1)
      - サブリクエストの合計数
    - `max-request-per-worker` (default: 1)
      - 1つのworkerあたりの最大リクエスト数
    - `r2-connection-enabled` (default: false)
      - R2バケットへのサブリクエストを行うかどうか
        - true
          - R2Bucketに対するサブリクエストを発行
            - `R2_TEST_FILE_KEY`で指定したキーに対して、R2の`object->get()`メソッドによりオブジェクトが取得される
        - false
          - 外部URLに対するサブリクエストを発行
            - `FETCH_TEST_ENDPOINT_PATH` で指定した外部URLに対して、`fetch()`メソッドによりリソースが取得される

