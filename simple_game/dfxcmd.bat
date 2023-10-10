@echo on
dfx identity use second-identity
dfx canister call simple_game initialize '("b77ix-eeaaa-aaaaa-qaada-cai")'
dfx canister call simple_game createCharacter '()'
dfx canister call simple_game createBattle '(100,4)'
dfx canister call simple_game openedBattles '()'
dfx identity use third-identity
dfx canister call simple_game createCharacter '()'