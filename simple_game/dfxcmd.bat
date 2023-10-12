@echo on
dfx identity use default
cd ../token
dfx canister call token initialize '("CozToken","COZ",10000)'
dfx canister call token addAdmin '("bd3sg-teaaa-aaaaa-qaaba-cai")'
dfx canister call token approve '("bd3sg-teaaa-aaaaa-qaaba-cai",1000)'
dfx canister call token transfer '("icjnw-eeogh-khwwx-k2cpg-ydxxg-2kvmg-frefb-r7ol4-w5z5v-mazip-yae", 1000)'
dfx identity use second-identity
dfx canister call token approve '("bd3sg-teaaa-aaaaa-qaaba-cai",1000)'
dfx identity use default
cd ../simple_game
dfx canister call simple_game initialize '("be2us-64aaa-aaaaa-qaabq-cai")'
dfx canister call simple_game createCharacter '()'
dfx canister call simple_game createBattle '(100,4)'
dfx canister call simple_game openedBattles '()'
dfx identity use second-identity
dfx canister call simple_game createCharacter '()'